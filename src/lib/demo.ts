import type { FieldDB } from "./db";
import type { Farmer, Identity, Stage, Submission, Workflow } from "./types";
import { DEMO_PROJECT, sampleTemplates } from "./templates";
import { polygonFromVertices } from "./geometry";
export const demoIdentity: Identity = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "local-demo@fieldwork.example",
  name: "Ananya Sharma",
  demo: true,
};
export const demoProject = {
  id: DEMO_PROJECT,
  name: "Narmada Agroforestry",
  region: "Madhya Pradesh, India",
  sites: ["Sehore", "Dewas", "Harda"],
  gps_threshold: 20,
  role: "surveyor" as const,
};
export function syntheticData(owner = demoIdentity.id) {
  const people = [
    ["Ramesh Patel", "Bilkisganj", "Sehore"],
    ["Sunita Bai", "Ichhawar", "Sehore"],
    ["Mohan Singh", "Sonkatch", "Dewas"],
    ["Kamla Devi", "Timarni", "Harda"],
    ["Rajesh Verma", "Ashta", "Sehore"],
    ["Meena Yadav", "Khategaon", "Dewas"],
    ["Suresh Chouhan", "Rahatgaon", "Harda"],
    ["Rekha Patel", "Nasrullaganj", "Sehore"],
  ];
  const farmers: Farmer[] = people.map(([name, village, site], i) => ({
    id: `44444444-4444-4444-8444-${String(i + 1).padStart(12, "0")}`,
    project_id: DEMO_PROJECT,
    ref: `NRM-${String(i + 1).padStart(4, "0")}`,
    name,
    village,
    site,
    phone: "",
    gps: {
      latitude: 23.19 + i * 0.004,
      longitude: 77.05 + i * 0.006,
      accuracy: 8 + i,
      timestamp: "2026-08-05T09:10:00Z",
    },
    created_by: owner,
    created_at: `2026-08-${String(5 + i).padStart(2, "0")}T09:10:00Z`,
    updated_at: "2026-09-09T10:00:00Z",
    revision: 0,
    sync_status: "saved_locally",
  }));
  const templates = sampleTemplates();
  let counter = 0;
  const submissions: Submission[] = [];
  function add(
    farmer: Farmer,
    stage: Stage,
    status: Workflow,
    date: string,
    answers: Submission["answers"],
  ) {
    const template = templates.find((t) => t.stage === stage)!;
    counter++;
    submissions.push({
      id: `55555555-5555-4555-8555-${String(counter).padStart(12, "0")}`,
      project_id: DEMO_PROJECT,
      farmer_id: farmer.id,
      stage,
      template_id: template.id,
      template_version: 1,
      status,
      answers,
      boundary:
        stage === "boundary"
          ? polygonFromVertices([
              [77.05, 23.19],
              [77.052, 23.19],
              [77.0523, 23.192],
              [77.0498, 23.1917],
            ])
          : null,
      vertex_gps: [],
      media_ids: [],
      created_by: owner,
      created_at: date,
      updated_at: date,
      submitted_at: status === "draft" ? null : date,
      revision: 0,
      sync_status: "saved_locally",
      reviews:
        status === "approved"
          ? [
              {
                status: "approved",
                comment: "Sample visit checked. Details are complete.",
                reviewer: "Demo supervisor",
                at: date,
              },
            ]
          : status === "needs_changes"
            ? [
                {
                  status: "needs_changes",
                  comment:
                    "Please confirm the number of existing trees on the next visit.",
                  reviewer: "Demo supervisor",
                  at: date,
                },
              ]
            : [],
    });
  }
  farmers.forEach((f, i) => {
    add(
      f,
      "baseline",
      i === 4
        ? "draft"
        : i === 5
          ? "needs_changes"
          : i === 2 || i === 6
            ? "submitted"
            : "approved",
      f.created_at,
      {
        visit_date: f.created_at.slice(0, 10),
        respondent: f.name,
        age: 38 + i * 3,
        household_size: 4 + (i % 3),
        main_income: "farming",
        land_tenure: "owned",
        land_area: 1.4 + i * 0.3,
        plots: 1,
        crops: ["wheat", "soybean"],
        irrigated: true,
        water_source: "well",
        soil_type: "black",
        existing_trees: 12 + i * 4,
        residue_burning: false,
        agroforestry_interest: true,
        collector: "Ananya Sharma",
        notes: "Synthetic field visit for the local demonstration.",
      },
    );
    if (i < 4)
      add(
        f,
        "consent",
        i === 2 ? "submitted" : "approved",
        "2026-08-14T10:20:00Z",
        {
          consent_granted: i !== 3,
          consent_date: "2026-08-14",
          collector: "Ananya Sharma",
          language: "hi",
          notes:
            i === 3
              ? "Farmer declined participation. No implementation visit."
              : "",
        },
      );
    if (i < 2) {
      add(f, "boundary", "approved", "2026-08-15T10:30:00Z", {
        visit_date: "2026-08-15",
        collector: "Ananya Sharma",
      });
      add(f, "implementation", "approved", "2026-08-20T10:30:00Z", {
        visit_date: "2026-08-20",
        trees_planted: 150 + i * 20,
        species: "Neem, moringa and teak",
        practice: "agroforestry",
        collector: "Ananya Sharma",
      });
    }
    if (i === 0) {
      add(f, "monitoring", "approved", "2026-09-01T10:30:00Z", {
        visit_date: "2026-09-01",
        trees_alive: 146,
        average_height: 0.85,
        issues: false,
        collector: "Ananya Sharma",
      });
      add(f, "monitoring", "submitted", "2026-09-09T10:30:00Z", {
        visit_date: "2026-09-09",
        trees_alive: 144,
        average_height: 0.96,
        issues: true,
        issue_details: "Two saplings need additional irrigation.",
        collector: "Ananya Sharma",
      });
    }
  });
  return { farmers, submissions, templates };
}
export async function seedLocalDemo(db: FieldDB) {
  if (await db.settings.get("demo_seeded")) return;
  const data = syntheticData();
  await db.transaction(
    "rw",
    [db.projects, db.templates, db.farmers, db.submissions, db.settings],
    async () => {
      await db.projects.put({
        ...demoProject,
        downloaded_at: new Date().toISOString(),
      });
      await db.templates.bulkPut(data.templates);
      await db.farmers.bulkPut(data.farmers);
      await db.submissions.bulkPut(data.submissions);
      await db.settings.put({ key: "demo_seeded", value: true });
    },
  );
}
