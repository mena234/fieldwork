import type { Farmer, Submission } from "./types";
function cell(value: unknown) {
  let s =
    typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
  return `"${s.replaceAll('"', '""')}"`;
}
export function toCSV(farmers: Farmer[], submissions: Submission[]) {
  const header = [
    "farmer_id",
    "farmer_ref",
    "farmer_name",
    "village",
    "site",
    "submission_id",
    "stage",
    "template_id",
    "template_version",
    "workflow_status",
    "sync_status",
    "created_at",
    "submitted_at",
    "updated_at",
    "answers",
    "media_ids",
    "reviews",
  ];
  return (
    "\uFEFF" +
    [
      header,
      ...submissions.map((s) => {
        const f = farmers.find((f) => f.id === s.farmer_id);
        return [
          s.farmer_id,
          f?.ref,
          f?.name,
          f?.village,
          f?.site,
          s.id,
          s.stage,
          s.template_id,
          s.template_version,
          s.status,
          s.sync_status,
          s.created_at,
          s.submitted_at,
          s.updated_at,
          s.answers,
          s.media_ids,
          s.reviews,
        ];
      }),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
export function toGeoJSON(farmers: Farmer[], submissions: Submission[]) {
  return {
    type: "FeatureCollection",
    features: farmers.flatMap((f) => {
      const props = {
        farmer_id: f.id,
        ref: f.ref,
        name: f.name,
        project_id: f.project_id,
        site: f.site,
      };
      const boundaries = submissions
        .filter((s) => s.farmer_id === f.id && s.boundary)
        .map((s) => ({
          type: "Feature",
          geometry: s.boundary,
          properties: {
            ...props,
            submission_id: s.id,
            stage: s.stage,
            template_version: s.template_version,
            status: s.status,
            captured_at: s.created_at,
          },
        }));
      return [
        ...(f.gps
          ? [
              {
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [f.gps.longitude, f.gps.latitude],
                },
                properties: {
                  ...props,
                  accuracy_m: f.gps.accuracy,
                  captured_at: f.gps.timestamp,
                },
              },
            ]
          : []),
        ...boundaries,
      ];
    }),
  };
}
export function downloadFile(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
