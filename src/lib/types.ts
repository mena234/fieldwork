export const STAGES = [
  "baseline",
  "consent",
  "boundary",
  "implementation",
  "monitoring",
] as const;
export type Stage = (typeof STAGES)[number];
export type Role = "surveyor" | "supervisor" | "admin";
export type Workflow = "draft" | "submitted" | "approved" | "needs_changes";
export type SyncStatus =
  "saved_locally" | "pending" | "syncing" | "synced" | "failed";
export type Lang = "en" | "hi";
export type Label = { en: string; hi: string };
export const stageLabels: Record<Stage, Label> = {
  baseline: { en: "Baseline survey", hi: "आधारभूत सर्वेक्षण" },
  consent: { en: "FPIC consent", hi: "एफपीआईसी सहमति" },
  boundary: { en: "Boundary mapping", hi: "सीमा मानचित्रण" },
  implementation: { en: "Implementation", hi: "क्रियान्वयन" },
  monitoring: { en: "Monitoring", hi: "निगरानी" },
};
export type GPS = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  override_reason?: string;
};
export type Polygon = { type: "Polygon"; coordinates: number[][][] };
export type Answer = string | number | boolean | string[] | GPS | null;
export type Answers = Record<string, Answer>;
export type Field = {
  id: string;
  label: Label;
  type:
    | "text"
    | "number"
    | "date"
    | "select"
    | "multiselect"
    | "boolean"
    | "gps"
    | "photo";
  section: Label;
  required?: boolean;
  min?: number;
  max?: number;
  options?: { value: string; label: Label }[];
  visible_when?: { field: string; equals: string | boolean };
  hint?: Label;
};
export type Template = {
  id: string;
  project_id: string;
  stage: Stage;
  version: number;
  name: Label;
  fields: Field[];
  consent_statement?: Label;
  published_at: string;
};
export type Project = {
  id: string;
  name: string;
  region: string;
  sites: string[];
  gps_threshold: number;
  role: Role;
  downloaded_at?: string;
};
export type BaseRecord = {
  id: string;
  project_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  revision: number;
  sync_status: SyncStatus;
};
export type Farmer = BaseRecord & {
  ref: string;
  name: string;
  village: string;
  site: string;
  phone: string;
  gps: GPS | null;
};
export type Review = {
  status: Workflow;
  comment: string;
  reviewer: string;
  at: string;
};
export type Submission = BaseRecord & {
  farmer_id: string;
  stage: Stage;
  template_id: string;
  template_version: number;
  status: Workflow;
  answers: Answers;
  boundary: Polygon | null;
  vertex_gps: GPS[];
  media_ids: string[];
  submitted_at: string | null;
  reviews: Review[];
};
export type Media = BaseRecord & {
  submission_id: string;
  field_id: string;
  blob: Blob;
  size: number;
  path: string;
  uploaded: boolean;
};
export type Kind = "farmer" | "submission" | "media";
export type QueueItem = {
  id: string;
  kind: Kind;
  entity_id: string;
  project_id: string;
  mutation_id: string;
  expected_revision: number;
  status: "pending" | "syncing" | "failed" | "conflict";
  attempts: number;
  error?: string;
  updated_at: string;
  server_copy?: Record<string, unknown>;
};
export type Identity = {
  id: string;
  email: string;
  name: string;
  demo?: boolean;
};
