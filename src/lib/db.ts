import Dexie, { type Table } from "dexie";
import type {
  Farmer,
  Submission,
  Media,
  Project,
  Template,
  QueueItem,
  Kind,
  BaseRecord,
} from "./types";
import { now, uid } from "./utils";
export class FieldDB extends Dexie {
  projects!: Table<Project, string>;
  templates!: Table<Template, string>;
  farmers!: Table<Farmer, string>;
  submissions!: Table<Submission, string>;
  media!: Table<Media, string>;
  queue!: Table<QueueItem, string>;
  settings!: Table<{ key: string; value: unknown }, string>;
  archives!: Table<
    { id: string; kind: Kind; record: unknown; saved_at: string },
    string
  >;
  constructor(owner: string) {
    super(`fieldwork-${owner}`);
    this.version(1).stores({
      projects: "id",
      templates: "id,[project_id+stage]",
      farmers: "id,project_id,name",
      submissions: "id,project_id,farmer_id,stage,status",
      media: "id,project_id,submission_id",
      queue: "id,project_id,status,kind",
      settings: "key",
      archives: "id",
    });
  }
}
export function tableFor(db: FieldDB, kind: Kind) {
  return (
    kind === "farmer"
      ? db.farmers
      : kind === "submission"
        ? db.submissions
        : db.media
  ) as Table<BaseRecord & Record<string, unknown>, string>;
}
export async function saveRecord(
  db: FieldDB,
  kind: Kind,
  record: Farmer | Submission | Media,
) {
  await db.transaction(
    "rw",
    [db.farmers, db.submissions, db.media, db.queue],
    async () => {
      const table = tableFor(db, kind);
      const existing = await table.get(record.id);
      const queue = await db.queue.get(`${kind}:${record.id}`);
      const updated = {
        ...record,
        revision: existing?.revision ?? record.revision,
        updated_at: now(),
        sync_status: "pending",
      };
      await table.put(updated as BaseRecord & Record<string, unknown>);
      await db.queue.put({
        id: `${kind}:${record.id}`,
        kind,
        entity_id: record.id,
        project_id: record.project_id,
        mutation_id: uid(),
        expected_revision: existing?.revision ?? record.revision,
        status: queue?.status === "conflict" ? "conflict" : "pending",
        server_copy: queue?.server_copy,
        attempts: queue?.attempts ?? 0,
        error: queue?.status === "conflict" ? queue.error : undefined,
        updated_at: now(),
      });
    },
  );
}
export async function addPhoto(db: FieldDB, media: Media) {
  await db.transaction(
    "rw",
    [db.farmers, db.submissions, db.media, db.queue],
    async () => {
      const submission = await db.submissions.get(media.submission_id);
      if (
        !submission ||
        !["draft", "needs_changes"].includes(submission.status)
      )
        throw new Error("Open an editable draft before adding a photo.");
      if (submission.media_ids.length >= 3)
        throw new Error("The demo allows up to 3 photos per submission.");
      await saveRecord(db, "media", media);
      await saveRecord(db, "submission", {
        ...submission,
        media_ids: [...submission.media_ids, media.id],
      });
    },
  );
}
export async function mergeRemote(
  db: FieldDB,
  kind: Kind,
  records: Record<string, unknown>[],
) {
  await db.transaction(
    "rw",
    [db.farmers, db.submissions, db.media, db.queue],
    async () => {
      for (const record of records) {
        const id = String(record.id);
        const table = tableFor(db, kind);
        const local = await table.get(id);
        const queue = await db.queue.get(`${kind}:${id}`);
        if (queue) {
          // A failed response may already have committed. Let the write RPC
          // replay its receipt before classifying a newer revision as a conflict.
          if (queue.status === "conflict") {
            await db.queue.update(queue.id, {
              status: "conflict",
              server_copy: record,
              error:
                "This record changed on another device. Your local copy is preserved.",
            });
            await table.update(id, { sync_status: "failed" });
          }
          continue;
        }
        await table.put({
          ...local,
          ...record,
          sync_status: "synced",
        } as BaseRecord & Record<string, unknown>);
      }
    },
  );
}
export async function resolveConflict(
  db: FieldDB,
  item: QueueItem,
  choice: "server" | "local",
) {
  if (!item.server_copy)
    throw new Error("Download the latest server copy before resolving.");
  const serverCopy = item.server_copy;
  await db.transaction(
    "rw",
    [db.farmers, db.submissions, db.media, db.queue, db.archives],
    async () => {
      const table = tableFor(db, item.kind),
        local = await table.get(item.entity_id);
      if (!local) return;
      await db.archives.put({
        id: uid(),
        kind: item.kind,
        record: local,
        saved_at: now(),
      });
      if (choice === "server") {
        await table.put({
          ...item.server_copy,
          sync_status: "synced",
        } as BaseRecord & Record<string, unknown>);
        await db.queue.delete(item.id);
      } else {
        if (
          item.kind === "submission" &&
          !["draft", "needs_changes"].includes(String(serverCopy.status))
        )
          throw new Error(
            "Reviewed or submitted records cannot be overwritten. Use the server copy and create a new visit.",
          );
        await table.update(item.entity_id, {
          revision: Number(serverCopy.revision),
          sync_status: "pending",
        });
        await db.queue.update(item.id, {
          mutation_id: uid(),
          expected_revision: Number(serverCopy.revision),
          status: "pending",
          error: undefined,
          server_copy: undefined,
        });
      }
    },
  );
}
