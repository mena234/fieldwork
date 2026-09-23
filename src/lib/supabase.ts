import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FieldDB } from "./db";
import { mergeRemote } from "./db";
import type { Project, Identity, Kind, QueueItem } from "./types";
import type { Transport } from "./sync";
import { now } from "./utils";
export const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
let client: SupabaseClient | undefined;
export function supabase() {
  if (!configured)
    throw new Error(
      "Supabase is not configured. Add the project URL and publishable key, then rebuild. Local work is preserved.",
    );
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  ));
}
export const unpack = (
  row: Record<string, unknown>,
): Record<string, unknown> => ({
  ...(row.data as object),
  ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "data")),
  sync_status: "synced",
});
async function allRows(table: string, projectId?: string) {
  let rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 500) {
    let query = supabase()
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + 499);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function assignedProjects(): Promise<Project[]> {
  const c = supabase();
  const {
    data: { user },
    error: authError,
  } = await c.auth.getUser();
  if (authError || !user)
    throw new Error("Sign in online to download your projects.");
  const { data, error } = await c
    .from("memberships")
    .select("project_id,role,projects(*)")
    .eq("user_id", user.id);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    ...(m.projects as unknown as Project),
    role: m.role,
  }));
}
export async function downloadProject(db: FieldDB, project: Project) {
  const templates = await allRows("templates", project.id);
  await db.templates.bulkPut(templates.map((t) => t.data as never));
  await pullProject(db, project.id, true);
  await db.projects.put({ ...project, downloaded_at: now() });
}
export async function pullProject(
  db: FieldDB,
  projectId: string,
  includeMedia = true,
) {
  const [farmers, submissions, media] = await Promise.all([
    allRows("farmers", projectId),
    allRows("submissions", projectId),
    allRows("media", projectId),
  ]);
  await mergeRemote(db, "farmer", farmers.map(unpack));
  await mergeRemote(db, "submission", submissions.map(unpack));
  if (includeMedia)
    for (const row of media) {
      const remote = unpack(row),
        local = await db.media.get(String(row.id));
      if (local?.blob) continue;
      const { data, error } = await supabase()
        .storage.from("field-photos")
        .download(String(remote.path));
      if (error) throw new Error(`Photo download failed: ${error.message}`);
      await mergeRemote(db, "media", [
        { ...remote, blob: data, uploaded: true },
      ]);
    }
  const templates = await allRows("templates", projectId);
  await db.templates.bulkPut(templates.map((t) => t.data as never));
}
export function cloudTransport(db: FieldDB, identity: Identity): Transport {
  return {
    async authenticate() {
      if (identity.demo)
        throw new Error(
          "Local demonstration: cloud sync is unavailable. Sign in to a configured Supabase project to sync real records.",
        );
      const { data, error } = await supabase().auth.getUser();
      if (error || !data.user || data.user.id !== identity.id)
        throw new Error(
          "Your session has expired. Sign in again before syncing. All local work is preserved.",
        );
    },
    async write(item: QueueItem, record: Record<string, unknown>) {
      const { data, error } = await supabase().rpc("fieldwork_write", {
        p_kind: item.kind,
        p_record: record,
        p_expected: item.expected_revision,
        p_mutation: item.mutation_id,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    async upload(path, blob) {
      const { error } = await supabase()
        .storage.from("field-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (
        error &&
        String(error.statusCode) !== "409" &&
        error.message !== "The resource already exists"
      )
        throw new Error(error.message);
    },
    async pull() {
      const projects = await assignedProjects();
      for (const p of projects) {
        const downloaded = await db.projects.get(p.id);
        if (downloaded) {
          await pullProject(db, p.id);
          await db.projects.update(p.id, { role: p.role });
        }
      }
      const permitted = new Set(projects.map((p) => p.id));
      for (const p of await db.projects.toArray())
        if (!permitted.has(p.id))
          await db.projects.update(p.id, { downloaded_at: undefined });
    },
  };
}
export async function reviewSubmission(
  id: string,
  revision: number,
  status: "approved" | "needs_changes",
  comment: string,
) {
  const { data, error } = await supabase().rpc("fieldwork_review", {
    p_id: id,
    p_expected: revision,
    p_status: status,
    p_comment: comment,
  });
  if (error) throw new Error(error.message);
  return data;
}
