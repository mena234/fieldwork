import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { syntheticData, demoProject } from "../src/lib/demo";
import { sampleTemplates } from "../src/lib/templates";
async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  if (process.argv.includes("--templates-only")) {
    await mkdir("templates", { recursive: true });
    for (const template of sampleTemplates())
      await writeFile(
        `templates/${template.stage}-v1.json`,
        JSON.stringify(template, null, 2) + "\n",
      );
    console.log("Wrote 5 versioned English/Hindi JSON templates.");
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SERVICE_ROLE_KEY,
      password = process.env.DEMO_USER_PASSWORD;
    if (!url || !key || !password || password.length < 12)
      throw new Error(
        "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and a DEMO_USER_PASSWORD of at least 12 characters in .env.local. Never expose the service-role key to the browser.",
      );
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    async function check<T extends { error: unknown }>(
      result: PromiseLike<T>,
    ): Promise<T> {
      const r = await result;
      if (r.error) throw r.error;
      return r;
    }
    const users = [];
    for (let page = 1; ; page++) {
      const { data, error } = await client.auth.admin.listUsers({
        page,
        perPage: 100,
      });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < 100) break;
    }
    const ids: Record<string, string> = {};
    for (const [role, name] of [
      ["surveyor", "Ananya Sharma"],
      ["supervisor", "Vikram Joshi"],
      ["admin", "Project Administrator"],
      ["outsider", "Unassigned Demo User"],
    ]) {
      const email = `${role}@fieldwork.example`;
      let user = users.find((u) => u.email === email);
      if (!user) {
        const { data, error } = await client.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: name },
        });
        if (error) throw error;
        user = data.user!;
      }
      ids[role] = user.id;
      console.log(`${role}: ${email} (id ${user.id})`);
    }
    const { role: unused, ...project } = demoProject;
    await check(
      client
        .from("projects")
        .upsert(project, { onConflict: "id", ignoreDuplicates: true }),
    );
    const other = "99999999-9999-4999-8999-999999999999";
    await check(
      client
        .from("projects")
        .upsert(
          {
            id: other,
            name: "Separate access-control project",
            region: "Demo isolation check",
            sites: ["Other site"],
            gps_threshold: 20,
          },
          { onConflict: "id", ignoreDuplicates: true },
        ),
    );
    for (const role of ["surveyor", "supervisor", "admin"])
      await check(
        client
          .from("memberships")
          .upsert(
            { project_id: project.id, user_id: ids[role], role },
            { onConflict: "project_id,user_id" },
          ),
      );
    await check(
      client
        .from("memberships")
        .upsert(
          { project_id: other, user_id: ids.outsider, role: "supervisor" },
          { onConflict: "project_id,user_id" },
        ),
    );
    const sample = syntheticData(ids.surveyor);
    for (const t of sample.templates)
      await check(
        client
          .from("templates")
          .upsert(
            {
              id: t.id,
              project_id: t.project_id,
              stage: t.stage,
              version: t.version,
              published_at: t.published_at,
              data: t,
            },
            { onConflict: "id", ignoreDuplicates: true },
          ),
      );
    for (const f of sample.farmers) {
      const { sync_status, ...data } = f;
      await check(
        client
          .from("farmers")
          .upsert(
            {
              id: f.id,
              project_id: f.project_id,
              created_by: f.created_by,
              created_at: f.created_at,
              updated_at: f.updated_at,
              revision: 1,
              data,
            },
            { onConflict: "id", ignoreDuplicates: true },
          ),
      );
    }
    for (const s of sample.submissions) {
      const { sync_status, ...data } = s;
      await check(
        client
          .from("submissions")
          .upsert(
            {
              id: s.id,
              project_id: s.project_id,
              farmer_id: s.farmer_id,
              template_id: s.template_id,
              template_version: s.template_version,
              stage: s.stage,
              status: s.status,
              created_by: s.created_by,
              created_at: s.created_at,
              updated_at: s.updated_at,
              revision: 1,
              data,
            },
            { onConflict: "id", ignoreDuplicates: true },
          ),
      );
    }
    console.log(
      `Seeded ${sample.farmers.length} synthetic farmers, ${sample.submissions.length} visits, and ${sample.templates.length} templates. Existing farmer records, visits, and template versions were retained.`,
    );
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
