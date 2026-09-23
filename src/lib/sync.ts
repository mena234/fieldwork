import type { FieldDB } from "./db";
import { tableFor } from "./db";
import type { QueueItem } from "./types";
import { errorMessage, now } from "./utils";
export type WriteResult = {
  record?: Record<string, unknown>;
  conflict?: boolean;
  server?: Record<string, unknown>;
};
export interface Transport {
  authenticate(): Promise<void>;
  write(item: QueueItem, record: Record<string, unknown>): Promise<WriteResult>;
  upload(path: string, blob: Blob): Promise<void>;
  pull(): Promise<void>;
}
const running = new Map<string, Promise<void>>();
export function syncNow(db: FieldDB, transport: Transport): Promise<void> {
  const existing = running.get(db.name);
  if (existing) return existing;
  const execute = () => runSync(db, transport);
  const task = (
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(`${db.name}-sync`, execute)
      : execute()
  ).finally(() => running.delete(db.name));
  running.set(
    db.name,
    Promise.resolve(task).then(() => {}),
  );
  return running.get(db.name)!;
}
export async function runSync(db: FieldDB, transport: Transport) {
  await transport.authenticate();
  await db.queue
    .where("status")
    .equals("syncing")
    .modify({ status: "pending" });
  const queue = await db.queue.toArray();
  const rank = { farmer: 0, submission: 1, media: 2 };
  queue.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] || a.updated_at.localeCompare(b.updated_at),
  );
  for (const queued of queue) {
    const snapshot = await db.transaction(
      "r",
      [db.farmers, db.submissions, db.media, db.queue],
      async () => ({
        item: await db.queue.get(queued.id),
        record: await tableFor(db, queued.kind).get(queued.entity_id),
      }),
    );
    const item = snapshot.item;
    if (!item || item.status === "conflict") continue;
    const table = tableFor(db, item.kind);
    let record = snapshot.record;
    if (!record) continue;
    try {
      if (item.kind === "submission") {
        const parent = await db.queue.get(`farmer:${record.farmer_id}`);
        if (parent)
          throw new Error(
            "Waiting for the farmer record to sync. Retry after resolving its error.",
          );
      }
      if (item.kind === "media") {
        const parent = await db.queue.get(`submission:${record.submission_id}`);
        if (parent)
          throw new Error(
            "Waiting for the submission to sync. Retry after resolving its error.",
          );
      }
      await db.queue.update(item.id, {
        status: "syncing",
        attempts: item.attempts + 1,
        error: undefined,
      });
      await table.update(item.entity_id, { sync_status: "syncing" });
      if (item.kind === "media" && !record.uploaded) {
        await transport.upload(String(record.path), record.blob as Blob);
        await table.update(item.entity_id, { uploaded: true });
        record = { ...record, uploaded: true };
      }
      const payload = Object.fromEntries(
        Object.entries(record).filter(
          ([key]) => !["blob", "sync_status", "uploaded"].includes(key),
        ),
      );
      const result = await transport.write(item, payload);
      if (result.conflict) {
        await db.queue.update(item.id, {
          status: "conflict",
          server_copy: result.server,
          error:
            "A newer server revision exists. Your local changes are preserved.",
        });
        await table.update(item.entity_id, { sync_status: "failed" });
        continue;
      }
      if (!result.record || typeof result.record.revision !== "number")
        throw new Error("The server did not confirm this record. Retry sync.");
      await db.transaction(
        "rw",
        [db.farmers, db.submissions, db.media, db.queue],
        async () => {
          const latest = await db.queue.get(item.id);
          if (latest?.mutation_id === item.mutation_id) {
            await table.put({
              ...record!,
              ...result.record,
              sync_status: "synced",
            });
            await db.queue.delete(item.id);
          } else if (latest) {
            await table.update(item.entity_id, {
              revision: result.record!.revision,
              sync_status: "pending",
            });
            await db.queue.update(item.id, {
              expected_revision: Number(result.record!.revision),
              status: "pending",
            });
          }
        },
      );
    } catch (error) {
      await db.queue.update(item.id, {
        status: "failed",
        error: errorMessage(error),
      });
      await table.update(item.entity_id, { sync_status: "failed" });
    }
  }
  await transport.pull();
  if ((await db.queue.count()) === 0)
    await db.settings.put({ key: "last_sync", value: now() });
}
