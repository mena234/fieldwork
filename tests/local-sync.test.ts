import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FieldDB,
  addPhoto,
  mergeRemote,
  resolveConflict,
  saveRecord,
} from "../src/lib/db";
import { runSync, syncNow, type Transport } from "../src/lib/sync";
import { syntheticData } from "../src/lib/demo";
import { uid } from "../src/lib/utils";
import { toCSV, toGeoJSON } from "../src/lib/export";
import { polygonFromVertices, validatePolygon } from "../src/lib/geometry";
import {
  sampleTemplates,
  validateAnswers,
  validateTemplate,
} from "../src/lib/templates";
import type { Farmer, Media, QueueItem, Submission } from "../src/lib/types";
let db: FieldDB;
const sample = syntheticData();
beforeEach(() => {
  db = new FieldDB("test-" + uid());
});
afterEach(async () => {
  await db.delete();
});
function transport(overrides: Partial<Transport> = {}): Transport {
  return {
    async authenticate() {},
    async upload() {},
    async pull() {},
    async write(item, record) {
      return { record: { ...record, revision: item.expected_revision + 1 } };
    },
    ...overrides,
  };
}
describe("durable collection and synchronization", () => {
  it("farmer, draft, polygon, photo blob, and queue survive closing IndexedDB", async () => {
    const farmer = sample.farmers[0],
      submission = {
        ...sample.submissions[0],
        status: "draft" as const,
        boundary: sample.submissions.find((s) => s.boundary)!.boundary,
      };
    await saveRecord(db, "farmer", farmer);
    await saveRecord(db, "submission", submission);
    const media: Media = {
      ...farmer,
      id: uid(),
      submission_id: submission.id,
      field_id: "farm_photo",
      path: "photo.jpg",
      blob: new Blob(["actual-photo-bytes"], { type: "image/jpeg" }),
      size: 18,
      uploaded: false,
    };
    await addPhoto(db, media);
    const name = db.name;
    db.close();
    db = new FieldDB(name.replace("fieldwork-", ""));
    expect((await db.farmers.get(farmer.id))?.name).toBe(farmer.name);
    expect((await db.submissions.get(submission.id))?.boundary).toEqual(
      submission.boundary,
    );
    expect(await (await db.media.get(media.id))!.blob.text()).toBe(
      "actual-photo-bytes",
    );
    expect(await db.queue.count()).toBe(3);
  });
  it("uploads farmer before dependent submission and confirms only after response", async () => {
    await saveRecord(db, "submission", sample.submissions[0]);
    await saveRecord(db, "farmer", sample.farmers[0]);
    const order: string[] = [];
    await runSync(
      db,
      transport({
        async write(item, record) {
          order.push(item.kind);
          expect((await db.queue.get(item.id))?.status).toBe("syncing");
          expect(
            (await db.farmers.get(sample.farmers[0].id))?.sync_status,
          ).not.toBe(item.kind === "farmer" ? "synced" : "pending");
          return { record: { ...record, revision: 1 } };
        },
      }),
    );
    expect(order).toEqual(["farmer", "submission"]);
    expect(await db.queue.count()).toBe(0);
    expect(
      (await db.submissions.get(sample.submissions[0].id))?.sync_status,
    ).toBe("synced");
  });
  it("failed writes remain visible and retryable without deleting local work", async () => {
    await saveRecord(db, "farmer", sample.farmers[0]);
    await runSync(
      db,
      transport({
        async write() {
          throw new Error("Network interrupted");
        },
      }),
    );
    expect((await db.queue.toArray())[0]).toMatchObject({
      status: "failed",
      error: "Network interrupted",
    });
    expect((await db.farmers.toArray())[0].name).toBe(sample.farmers[0].name);
    await runSync(db, transport());
    expect(await db.queue.count()).toBe(0);
  });
  it("reuses mutation ID after a server commit with a lost response; no duplicate", async () => {
    await saveRecord(db, "farmer", sample.farmers[0]);
    const seen = new Map();
    let loseResponse = true;
    const server = transport({
      async write(item, record) {
        if (!seen.has(item.mutation_id))
          seen.set(item.mutation_id, { ...record, revision: 1 });
        if (loseResponse) {
          loseResponse = false;
          throw new Error("Response lost");
        }
        return { record: seen.get(item.mutation_id) };
      },
      async pull() {
        await mergeRemote(db, "farmer", [...seen.values()]);
      },
    });
    await runSync(db, server);
    await runSync(db, server);
    await runSync(db, server);
    expect(seen.size).toBe(1);
    expect(await db.queue.count()).toBe(0);
  });
  it("preserves edits made while a previous version is uploading", async () => {
    await saveRecord(db, "farmer", sample.farmers[0]);
    await runSync(
      db,
      transport({
        async write(item, record) {
          await saveRecord(db, "farmer", {
            ...sample.farmers[0],
            name: "Changed during sync",
          });
          return { record: { ...record, revision: 1 } };
        },
      }),
    );
    expect((await db.farmers.toArray())[0]).toMatchObject({
      name: "Changed during sync",
      revision: 1,
      sync_status: "pending",
    });
    expect((await db.queue.toArray())[0].expected_revision).toBe(1);
    await runSync(db, transport());
    expect(await db.queue.count()).toBe(0);
  });
  it("preserves conflicts, archives local copy, and does not silently overwrite", async () => {
    const f = sample.farmers[0];
    await saveRecord(db, "farmer", { ...f, name: "Local name" });
    await runSync(
      db,
      transport({
        async write() {
          return {
            conflict: true,
            server: { ...f, name: "Server name", revision: 2 },
          };
        },
      }),
    );
    expect((await db.farmers.get(f.id))?.name).toBe("Local name");
    const q = (await db.queue.toArray())[0];
    expect(q.status).toBe("conflict");
    await resolveConflict(db, q, "server");
    expect((await db.farmers.get(f.id))?.name).toBe("Server name");
    expect(await db.archives.count()).toBe(1);
  });
  it("does not reupload a confirmed blob after metadata failure", async () => {
    const s = { ...sample.submissions[0], status: "draft" as const };
    await db.farmers.put({
      ...sample.farmers[0],
      revision: 1,
      sync_status: "synced",
    });
    await db.submissions.put({ ...s, revision: 1, sync_status: "synced" });
    const id = uid();
    await addPhoto(db, {
      ...sample.farmers[0],
      id,
      submission_id: s.id,
      field_id: "farm_photo",
      blob: new Blob(["photo"]),
      size: 5,
      path: `photo/${id}.jpg`,
      uploaded: false,
    });
    let uploads = 0,
      fail = true;
    const t = transport({
      async upload() {
        uploads++;
      },
      async write(item, record) {
        if (item.kind === "media" && fail) {
          fail = false;
          throw new Error("Metadata failed");
        }
        return { record: { ...record, revision: item.expected_revision + 1 } };
      },
    });
    await runSync(db, t);
    expect(uploads).toBe(1);
    expect((await db.queue.toArray())[0].status).toBe("failed");
    await runSync(db, t);
    expect(uploads).toBe(1);
    expect(await db.queue.count()).toBe(0);
  });
  it("an expired session leaves all queued work untouched", async () => {
    await saveRecord(db, "farmer", sample.farmers[0]);
    await expect(
      runSync(
        db,
        transport({
          async authenticate() {
            throw new Error("Session expired");
          },
        }),
      ),
    ).rejects.toThrow("Session expired");
    expect(await db.queue.count()).toBe(1);
    expect((await db.farmers.toArray())[0].sync_status).toBe("pending");
  });
  it("pulling a supervisor result updates a clean record", async () => {
    const s = {
      ...sample.submissions[0],
      status: "submitted" as const,
      revision: 1,
    };
    await db.submissions.put(s);
    await mergeRemote(db, "submission", [
      {
        ...s,
        status: "approved",
        revision: 2,
        reviews: [{ comment: "Checked", status: "approved" }],
      },
    ]);
    expect((await db.submissions.get(s.id))?.status).toBe("approved");
  });
  it("coalesces repeated Sync now calls", async () => {
    await saveRecord(db, "farmer", sample.farmers[0]);
    let writes = 0;
    const t = transport({
      async write(item, record) {
        writes++;
        return { record: { ...record, revision: 1 } };
      },
    });
    await Promise.all([syncNow(db, t), syncNow(db, t), syncNow(db, t)]);
    expect(writes).toBe(1);
  });
  it("refuses an unconfirmed response", async () => {
    await saveRecord(db, "farmer", sample.farmers[0]);
    await runSync(
      db,
      transport({
        async write() {
          return {};
        },
      }),
    );
    expect((await db.queue.toArray())[0].status).toBe("failed");
    expect((await db.farmers.toArray())[0].sync_status).toBe("failed");
  });
});
describe("forms, geometry, and exports", () => {
  it("validates all bilingual templates and conditional baseline requirements", () => {
    for (const t of sampleTemplates())
      expect(() => validateTemplate(t)).not.toThrow();
    const base = sampleTemplates()[0];
    const answers = { ...sample.submissions[0].answers, land_tenure: "leased" };
    expect(validateAnswers(base, answers)).toHaveProperty("lease_years");
    expect(
      validateAnswers(base, { ...answers, lease_years: 3 }),
    ).not.toHaveProperty("lease_years");
    expect(validateAnswers(base, { ...answers, age: 12 })).toHaveProperty(
      "age",
    );
    expect(
      validateAnswers(base, { ...answers, visit_date: "2026-02-31" }),
    ).toHaveProperty("visit_date");
  });
  it("records declined consent without treating false as missing", () => {
    const t = sampleTemplates()[1];
    expect(
      validateAnswers(t, {
        consent_granted: false,
        consent_date: "2026-09-11",
        collector: "A",
        language: "hi",
      }),
    ).toEqual({});
  });
  it("rejects crossing edges, duplicate points, and invalid coordinates", () => {
    expect(
      validatePolygon(
        polygonFromVertices([
          [77, 23],
          [77.01, 23],
          [77.01, 23.01],
          [77, 23.01],
        ]),
      ),
    ).toBeNull();
    expect(
      validatePolygon(
        polygonFromVertices([
          [77, 23],
          [77.01, 23.01],
          [77.01, 23],
          [77, 23.01],
        ]),
      ),
    ).toContain("cross");
    expect(
      validatePolygon(
        polygonFromVertices([
          [190, 23],
          [191, 24],
          [191, 23],
        ]),
      ),
    ).toContain("valid");
  });
  it("exports farmer and submission identifiers, versioned answers, points and polygons", () => {
    const csv = toCSV(sample.farmers, sample.submissions);
    expect(csv).toContain("template_version");
    expect(csv).toContain(sample.submissions[0].id);
    expect(csv).toContain("land_area");
    const geo = toGeoJSON(sample.farmers, sample.submissions);
    expect(
      geo.features.filter((f) => f.geometry?.type === "Polygon"),
    ).toHaveLength(2);
    expect(
      geo.features.filter((f) => f.geometry?.type === "Point"),
    ).toHaveLength(8);
    expect(
      toCSV([{ ...sample.farmers[0], name: "=CMD()" }], sample.submissions),
    ).toContain("'=CMD()");
  });
});
