import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { sampleTemplates, DEMO_PROJECT } from "../src/lib/templates";
import { syntheticData, demoIdentity } from "../src/lib/demo";
import { uid } from "../src/lib/utils";
let pg: PGlite;
const surveyor = demoIdentity.id,
  supervisor = "66666666-6666-4666-8666-666666666666",
  outsider = "77777777-7777-4777-8777-777777777777",
  admin = "88888888-8888-4888-8888-888888888888";
const data = syntheticData();
async function login(id: string) {
  await pg.exec(
    `reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`,
  );
}
async function write(
  kind: string,
  record: object,
  expected = 0,
  mutation = uid(),
) {
  const r = await pg.query<{ result: any }>(
    "select public.fieldwork_write($1,$2::jsonb,$3,$4::uuid) as result",
    [kind, JSON.stringify(record), expected, mutation],
  );
  return r.rows[0].result;
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,storage to authenticated;grant execute on function auth.uid() to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);create function storage.foldername(name text) returns text[] language sql as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;alter table storage.objects enable row level security;grant select,insert on storage.objects to authenticated;`,
  );
  await pg.exec(
    await readFile("supabase/migrations/202609110001_fieldwork.sql", "utf8"),
  );
  await pg.query("insert into auth.users(id) values ($1),($2),($3),($4)", [
    surveyor,
    supervisor,
    outsider,
    admin,
  ]);
  await pg.query(
    "insert into public.projects(id,name,region,sites) values($1,$2,$3,$4)",
    [
      DEMO_PROJECT,
      "Narmada Agroforestry",
      "India",
      ["Sehore", "Dewas", "Harda"],
    ],
  );
  for (const [id, role] of [
    [surveyor, "surveyor"],
    [supervisor, "supervisor"],
    [admin, "admin"],
  ])
    await pg.query(
      "insert into public.memberships(project_id,user_id,role) values($1,$2,$3)",
      [DEMO_PROJECT, id, role],
    );
  for (const t of sampleTemplates())
    await pg.query(
      "insert into public.templates(id,project_id,stage,version,data) values($1,$2,$3,$4,$5)",
      [t.id, t.project_id, t.stage, t.version, JSON.stringify(t)],
    );
});
afterAll(async () => {
  await pg?.close();
});
describe("database authorization and exact retry semantics (PostgreSQL via PGlite)", () => {
  it("writes and replays the same mutation once, then returns revision conflict", async () => {
    await login(surveyor);
    const mutation = uid(),
      farmer = data.farmers[0];
    const first = await write("farmer", farmer, 0, mutation);
    const retry = await write("farmer", farmer, 0, mutation);
    expect(first.record.revision).toBe(1);
    expect(retry).toEqual(first);
    expect((await pg.query("select * from public.farmers")).rows).toHaveLength(
      1,
    );
    const conflict = await write("farmer", { ...farmer, name: "new" }, 0);
    expect(conflict.conflict).toBe(true);
    expect(conflict.server.name).toBe(farmer.name);
  });
  it("denies unassigned project reads through RLS and all write RPCs", async () => {
    await login(outsider);
    expect((await pg.query("select * from public.farmers")).rows).toHaveLength(
      0,
    );
    expect((await pg.query("select * from public.projects")).rows).toHaveLength(
      0,
    );
    expect(
      (await pg.query("select * from public.templates")).rows,
    ).toHaveLength(0);
    await expect(write("farmer", data.farmers[1])).rejects.toThrow(
      "membership",
    );
  });
  it("prevents direct writes and surveyor self-promotion", async () => {
    await login(surveyor);
    await expect(
      pg.query("update public.memberships set role=$1 where user_id=$2", [
        "admin",
        surveyor,
      ]),
    ).rejects.toThrow("permission denied");
    await expect(
      pg.query("select public.fieldwork_membership($1,$2,$3)", [
        DEMO_PROJECT,
        surveyor,
        "admin",
      ]),
    ).rejects.toThrow("admin membership");
    await expect(
      pg.query("update public.farmers set data=$1 where id=$2", [
        JSON.stringify({ name: "bypass" }),
        data.farmers[0].id,
      ]),
    ).rejects.toThrow("permission denied");
  });
  it("validates submitted forms and pins template versions", async () => {
    await login(surveyor);
    const s = {
      ...data.submissions[0],
      status: "submitted",
      template_version: 2,
    };
    await expect(write("submission", s)).rejects.toThrow("Template/version");
    await expect(
      write("submission", { ...s, template_version: 1, answers: {} }),
    ).rejects.toThrow("Required field");
    const result = await write("submission", {
      ...data.submissions[0],
      status: "submitted",
    });
    expect(result.record.status).toBe("submitted");
    expect(result.record.reviews).toEqual([]);
    await expect(
      write("submission", { ...data.submissions[0], status: "approved" }, 1),
    ).rejects.toThrow("immutable");
  });
  it("surveyor cannot review; supervisor can approve and surveyor reads result", async () => {
    await login(surveyor);
    await expect(
      pg.query("select public.fieldwork_review($1,1,$2,$3)", [
        data.submissions[0].id,
        "approved",
        "Checked",
      ]),
    ).rejects.toThrow("Supervisor membership");
    await login(outsider);
    await expect(
      pg.query("select public.fieldwork_review($1,1,$2,$3)", [
        data.submissions[0].id,
        "approved",
        "Checked",
      ]),
    ).rejects.toThrow("Supervisor membership");
    await login(supervisor);
    const reviewed = await pg.query<{ result: any }>(
      "select public.fieldwork_review($1,1,$2,$3) as result",
      [
        data.submissions[0].id,
        "approved",
        "Checked baseline against field evidence",
      ],
    );
    expect(reviewed.rows[0].result.status).toBe("approved");
    await login(surveyor);
    const read = await pg.query<{ status: string; revision: number }>(
      "select status,revision from public.submissions where id=$1",
      [data.submissions[0].id],
    );
    expect(read.rows[0]).toEqual({ status: "approved", revision: 2 });
  });
  it("photo upload RLS rejects outsiders and wrong paths; review waits for media", async () => {
    await login(surveyor);
    const s = {
      ...data.submissions[0],
      id: uid(),
      status: "submitted",
      media_ids: [uid()],
    };
    await write("submission", s);
    const path = `${DEMO_PROJECT}/${s.id}/${s.media_ids[0]}.jpg`;
    await expect(
      pg.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "field-photos",
        `${DEMO_PROJECT}/wrong.jpg`,
      ]),
    ).rejects.toThrow("row-level security");
    await login(outsider);
    await expect(
      pg.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "field-photos",
        path,
      ]),
    ).rejects.toThrow("row-level security");
    await login(supervisor);
    await expect(
      pg.query("select public.fieldwork_review($1,1,$2,$3)", [
        s.id,
        "approved",
        "Checked",
      ]),
    ).rejects.toThrow("photos");
    await login(surveyor);
    await pg.query(
      "insert into storage.objects(bucket_id,name) values($1,$2)",
      ["field-photos", path],
    );
    await write("media", {
      ...data.farmers[0],
      id: s.media_ids[0],
      submission_id: s.id,
      field_id: "farm_photo",
      path,
      size: 15000,
    });
    await login(supervisor);
    await pg.query("select public.fieldwork_review($1,1,$2,$3)", [
      s.id,
      "approved",
      "Photo checked",
    ]);
    expect((await pg.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
    await login(outsider);
    expect((await pg.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
  });
  it("only admins publish validated new template versions; old versions stay immutable", async () => {
    const t = { ...sampleTemplates()[0], version: 2 };
    await login(surveyor);
    await expect(
      pg.query("select public.fieldwork_publish_template($1)", [
        JSON.stringify(t),
      ]),
    ).rejects.toThrow("admin membership");
    await login(admin);
    await expect(
      pg.query("select public.fieldwork_publish_template($1)", [
        JSON.stringify({ ...t, fields: [{ id: "x" }] }),
      ]),
    ).rejects.toThrow("bilingual");
    await pg.query("select public.fieldwork_publish_template($1)", [
      JSON.stringify(t),
    ]);
    await expect(
      pg.query("select public.fieldwork_publish_template($1)", [
        JSON.stringify(t),
      ]),
    ).rejects.toThrow("duplicate key");
    await expect(
      pg.query("update public.templates set version=3 where id=$1", [
        sampleTemplates()[0].id,
      ]),
    ).rejects.toThrow("permission denied");
  });
});
