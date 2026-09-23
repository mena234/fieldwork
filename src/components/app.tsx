"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  CloudCheck,
  CloudOff,
  CloudUpload,
  Download,
  FileJson,
  FileText,
  Flag,
  Globe2,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sprout,
  Users,
  Wifi,
  WifiOff,
  X,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { FieldDB, mergeRemote, resolveConflict, saveRecord } from "@/lib/db";
import {
  configured,
  assignedProjects,
  cloudTransport,
  downloadProject,
  reviewSubmission,
  supabase,
} from "@/lib/supabase";
import { syncNow } from "@/lib/sync";
import { demoIdentity, seedLocalDemo } from "@/lib/demo";
import { validateTemplate } from "@/lib/templates";
import { downloadFile, toCSV, toGeoJSON } from "@/lib/export";
import {
  STAGES,
  stageLabels,
  type Farmer,
  type GPS,
  type Identity,
  type Lang,
  type Project,
  type QueueItem,
  type Stage,
  type Submission,
  type SyncStatus,
  type Template,
} from "@/lib/types";
import { dateLabel, errorMessage, initials, now, uid } from "@/lib/utils";
import { areaHectares } from "@/lib/geometry";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { FieldMap, BoundaryPreview, GPSCapture } from "./map";
import { FormEntry, Photo } from "./form-entry";
import { ProductTour } from "./product-tour";

type View =
  | "overview"
  | "farmers"
  | "map"
  | "forms"
  | "sync"
  | "review"
  | "settings"
  | "profile"
  | "entry";
const viewTitles: Record<View, string> = {
  overview: "Project overview",
  farmers: "Farmer registry",
  map: "Field map",
  forms: "Form library",
  sync: "Sync centre",
  review: "Review queue",
  settings: "Project settings",
  profile: "Farmer profile",
  entry: "Field visit",
};
const workflowText: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  approved: "Approved",
  needs_changes: "Needs changes",
  not_started: "Not started",
};
const syncText: Record<SyncStatus, string> = {
  saved_locally: "Saved locally",
  pending: "Pending",
  syncing: "Syncing",
  synced: "Synced",
  failed: "Failed",
};
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      {status === "approved" ? (
        <Check size={12} />
      ) : status === "submitted" ? (
        <ClipboardCheck size={12} />
      ) : status === "needs_changes" ? (
        <Flag size={12} />
      ) : null}
      {workflowText[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}
function SyncBadge({ status }: { status: SyncStatus }) {
  const Icon =
    status === "synced"
      ? CloudCheck
      : status === "failed"
        ? AlertTriangle
        : status === "syncing"
          ? RefreshCw
          : CloudUpload;
  return (
    <span className={`sync-label sync-${status}`}>
      <Icon size={14} />
      {syncText[status]}
    </span>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Sprout size={24} strokeWidth={1.8} />
      </span>
      <span>
        fieldwork<span className="brand-period">.</span>
      </span>
    </div>
  );
}
function stageOf(f: Farmer, submissions: Submission[]) {
  const visits = submissions
    .filter((s) => s.farmer_id === f.id)
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) ||
        STAGES.indexOf(b.stage) - STAGES.indexOf(a.stage),
    );
  return visits[0];
}
function navigate(view: View, id?: string) {
  window.location.hash = id ? `${view}/${id}` : view;
}

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(null),
    [booted, setBooted] = useState(false),
    [view, setView] = useState<View>("farmers"),
    [recordId, setRecordId] = useState(""),
    [online, setOnline] = useState(true),
    [lang, setLang] = useState<Lang>("en"),
    [projectId, setProjectId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [newFarmer, setNewFarmer] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [shellReady, setShellReady] = useState(false),
    [notice, setNotice] = useState(""),
    [projectPicker, setProjectPicker] = useState(false);
  const db = useMemo(
    () => (identity ? new FieldDB(identity.id) : null),
    [identity?.id],
  );
  const downloadedProjects = useLiveQuery(
    () => (db ? db.projects.toArray() : []),
    [db],
  );
  const projects = downloadedProjects ?? [];
  const project =
    projects.find((p) => p.id === projectId) ??
    projects.find((p) => p.downloaded_at);
  const farmerData = useLiveQuery(
    async () => ({
      projectId: project?.id ?? "",
      rows:
        db && project
          ? await db.farmers.where("project_id").equals(project.id).toArray()
          : [],
    }),
    [db, project?.id],
  );
  const farmers =
    farmerData?.projectId === (project?.id ?? "") ? farmerData.rows : [];
  const submissions =
    useLiveQuery(
      () =>
        db && project
          ? db.submissions.where("project_id").equals(project.id).toArray()
          : [],
      [db, project?.id],
    ) ?? [];
  const queue = useLiveQuery(() => (db ? db.queue.toArray() : []), [db]) ?? [];
  const lastSync = useLiveQuery(
    () => (db ? db.settings.get("last_sync") : undefined),
    [db],
  );
  useEffect(() => {
    try {
      const stored = localStorage.getItem("fieldwork-identity");
      if (stored) setIdentity(JSON.parse(stored));
      setLang(
        localStorage.getItem("fieldwork-language") === "hi" ? "hi" : "en",
      );
      setProjectId(localStorage.getItem("fieldwork-project") ?? "");
    } catch {
      setError(
        "This browser could not read your saved session. Sign in again.",
      );
    }
    setOnline(navigator.onLine);
    setBooted(true);
    const route = () => {
      const [v, id] = location.hash.slice(1).split("/");
      setView(v in viewTitles ? (v as View) : "farmers");
      setRecordId(id ?? "");
      setMobileNav(false);
      window.scrollTo(0, 0);
    };
    route();
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener("hashchange", route);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.removeEventListener("hashchange", route);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let live = true;
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        const check = () => {
          if (live) setShellReady(true);
        };
        if (reg.active) check();
        else
          reg.addEventListener("updatefound", () =>
            reg.installing?.addEventListener("statechange", () => {
              if (reg.active) check();
            }),
          );
      })
      .catch(() => {
        if (live) setShellReady(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(
    () => () => {
      db?.close();
    },
    [db],
  );
  async function signedIn(next: Identity) {
    localStorage.setItem("fieldwork-identity", JSON.stringify(next));
    setIdentity(next);
    setError("");
    if (next.demo) {
      const demoDB = new FieldDB(next.id);
      await seedLocalDemo(demoDB);
      demoDB.close();
    }
    navigate("farmers");
  }
  const sync = useCallback(async () => {
    if (!db || !identity) return;
    setBusy(true);
    setError("");
    try {
      await syncNow(db, cloudTransport(db, identity));
      const remaining = await db.queue.count();
      setNotice(
        remaining
          ? `${remaining} item${remaining === 1 ? "" : "s"} still need attention. Open Sync centre for details.`
          : "All changes confirmed by the server.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [db, identity]);
  useEffect(() => {
    if (online && identity && !identity.demo && db) void sync();
  }, [online, db]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  async function signOut() {
    if (configured && !identity?.demo)
      await supabase().auth.signOut({ scope: "local" });
    localStorage.removeItem("fieldwork-identity");
    setIdentity(null);
    setProjectId("");
    setNotice("");
    setError("");
  }
  async function beginStage(farmer: Farmer, stage: Stage) {
    if (!db || !identity || !project) return;
    try {
      const templates = await db.templates
        .where("[project_id+stage]")
        .equals([project.id, stage])
        .toArray();
      const template = templates.sort((a, b) => b.version - a.version)[0];
      if (!template)
        throw new Error(
          "Download this project’s form templates before starting a visit.",
        );
      const id = uid(),
        timestamp = now();
      const answers: Submission["answers"] = {};
      for (const field of template.fields) {
        if (field.id === "collector") answers.collector = identity.name;
        if (field.id === "respondent") answers.respondent = farmer.name;
        if (["visit_date", "consent_date"].includes(field.id))
          answers[field.id] = timestamp.slice(0, 10);
      }
      await saveRecord(db, "submission", {
        id,
        project_id: project.id,
        farmer_id: farmer.id,
        stage,
        template_id: template.id,
        template_version: template.version,
        status: "draft",
        answers,
        boundary: null,
        vertex_gps: [],
        media_ids: [],
        reviews: [],
        created_by: identity.id,
        created_at: timestamp,
        updated_at: timestamp,
        submitted_at: null,
        revision: 0,
        sync_status: "pending",
      });
      navigate("entry", id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (!booted)
    return (
      <div className="boot-screen">
        <Brand />
        <p>Opening your field workspace…</p>
      </div>
    );
  if (!identity) return <SignIn online={online} onSignIn={signedIn} />;
  const collecting = project?.role !== "supervisor";
  const reviewCount = submissions.filter(
    (s) => s.status === "submitted",
  ).length;
  const pendingCount = queue.length;
  const navigation = [
    { view: "overview" as View, label: "Overview", icon: LayoutDashboard },
    { view: "farmers" as View, label: "Farmers", icon: Users },
    { view: "map" as View, label: "Field map", icon: MapIcon },
    { view: "forms" as View, label: "Form library", icon: FileText },
    { view: "sync" as View, label: "Sync centre", icon: RefreshCw },
  ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <Brand />
        <button
          className="project-switch"
          onClick={() => setProjectPicker(true)}
        >
          <span className="project-symbol">
            <Leaf size={18} />
          </span>
          <span>
            <strong>{project?.name ?? "Select project"}</strong>
            <small>{project?.region ?? "Download your workspace"}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.view}
              className={`nav-item ${view === n.view || (n.view === "farmers" && ["profile", "entry"].includes(view)) ? "active" : ""}`}
              onClick={() => navigate(n.view)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.view === "sync" && pendingCount > 0 && (
                <span className="nav-count">{pendingCount}</span>
              )}
            </button>
          ))}
          <div className="nav-label nav-section">PROJECT MANAGEMENT</div>
          <button
            className={`nav-item ${view === "review" ? "active" : ""}`}
            onClick={() => navigate("review")}
          >
            <ClipboardCheck size={19} />
            <span>Review queue</span>
            {reviewCount > 0 && (
              <span className="nav-count">{reviewCount}</span>
            )}
          </button>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
            <span>Project settings</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="device-status">
            <span className="device-icon">
              <CloudCheck size={21} />
            </span>
            <strong>
              {shellReady && project?.downloaded_at
                ? "Ready for offline use"
                : shellReady
                  ? "App available offline"
                  : "Preparing offline shell"}
            </strong>
            <p>
              {pendingCount
                ? `${pendingCount} changes stored on this device`
                : "Your downloaded work stays on this device."}
            </p>
            <button onClick={() => navigate("sync")}>
              View sync status <ArrowRight size={13} />
            </button>
          </div>
          <div className="user-panel">
            <span className="avatar user-avatar">
              {initials(identity.name)}
            </span>
            <div>
              <strong>{identity.name}</strong>
              <span>
                {identity.demo
                  ? "Local demonstration"
                  : project?.role === "admin"
                    ? "Project admin"
                    : project?.role === "supervisor"
                      ? "Supervisor"
                      : "Field surveyor"}
              </span>
            </div>
            <button
              className="icon-link"
              title="Sign out; local work is retained"
              aria-label="Sign out"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu btn btn-ghost btn-icon"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span className="top-project">
              {project?.name ?? "Field workspace"}
            </span>
            <ChevronRight size={14} />
            <strong>{viewTitles[view]}</strong>
          </div>
          <div className="topbar-right">
            <ProductTour
              key={identity.id}
              identityId={identity.id}
              demo={!!identity.demo}
              lang={lang}
              ready={
                !!db &&
                downloadedProjects !== undefined &&
                farmerData?.projectId === (project?.id ?? "") &&
                (!identity.demo || !!project?.downloaded_at)
              }
              hasProject={!!project?.downloaded_at}
              farmerId={
                farmers.slice().sort((a, b) => a.ref.localeCompare(b.ref))[0]
                  ?.id
              }
              autoStart={view !== "entry" && !newFarmer && !projectPicker}
            />
            <span className={`connection ${online ? "" : "is-offline"}`}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              <span>{online ? "Online" : "Offline"}</span>
            </span>
            <span className="top-divider" />
            <button
              className="language-toggle"
              onClick={() => {
                const next = lang === "en" ? "hi" : "en";
                setLang(next);
                localStorage.setItem("fieldwork-language", next);
              }}
            >
              <Globe2 size={16} />
              {lang === "en" ? "EN" : "हिन्दी"}
              <ChevronDown size={12} />
            </button>
            <span className="avatar top-avatar">{initials(identity.name)}</span>
          </div>
        </header>
        {identity.demo && (
          <div className="demo-strip">
            <span>
              <span className="demo-tag">LOCAL DEMO</span>Synthetic records ·
              changes persist on this device · cloud sync is not connected
            </span>
            <button onClick={() => void signOut()}>
              Connect account <ArrowRight size={13} />
            </button>
          </div>
        )}
        <main
          className="main-content"
          data-tour={
            !project?.downloaded_at || projectPicker
              ? "project-download"
              : undefined
          }
        >
          {error && (
            <div className="notice danger" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {db && (!project?.downloaded_at || projectPicker) ? (
            <ProjectDownload
              db={db}
              identity={identity}
              online={online}
              onSelect={(p) => {
                setProjectId(p.id);
                localStorage.setItem("fieldwork-project", p.id);
                setProjectPicker(false);
              }}
              onCancel={
                project?.downloaded_at
                  ? () => setProjectPicker(false)
                  : undefined
              }
            />
          ) : db && project ? (
            <>
              {(view === "farmers" || view === "overview") && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="project-kicker">
                        <span className="tiny-leaf">
                          <Leaf size={13} />
                        </span>{" "}
                        {project.region}
                      </div>
                      <h1>
                        {view === "farmers"
                          ? "Every farmer. Every visit."
                          : "Your project, in the field."}
                      </h1>
                      <p className="muted">
                        {view === "farmers"
                          ? "Keep field records connected, from first survey to long-term monitoring."
                          : "A shared view of fieldwork across your project sites."}
                      </p>
                    </div>
                    <div className="actions">
                      <Button
                        variant="outline"
                        onClick={() =>
                          downloadFile(
                            "fieldwork-submissions.csv",
                            toCSV(farmers, submissions),
                            "text/csv;charset=utf-8",
                          )
                        }
                      >
                        <Download size={16} />
                        Export data
                      </Button>
                      {collecting && (
                        <Button onClick={() => setNewFarmer(true)}>
                          <Plus size={18} />
                          Register farmer
                        </Button>
                      )}
                    </div>
                  </div>
                  <Stats
                    farmers={farmers}
                    submissions={submissions}
                    queue={queue}
                  />
                  <div className="registry-layout">
                    <FarmerRegistry
                      farmers={farmers}
                      submissions={submissions}
                      onRegister={() => setNewFarmer(true)}
                      collecting={collecting}
                    />
                    <aside className="registry-aside">
                      <div className="panel map-panel">
                        <div className="panel-heading">
                          <h2>In the field</h2>
                          <button
                            aria-label="Open field map"
                            className="icon-link"
                            onClick={() => navigate("map")}
                          >
                            <ArrowRight size={17} />
                          </button>
                        </div>
                        <FieldMap farmers={farmers} online={online} compact />
                        <div className="map-caption">
                          <span>
                            <span className="legend-dot" />
                            {farmers.filter((f) => f.gps).length} geolocated
                            farmers
                          </span>
                          <span>{project.sites.length} sites</span>
                        </div>
                      </div>
                      <StageProgress
                        submissions={submissions}
                        farmers={farmers}
                      />
                      <div className="offline-note">
                        <ShieldCheck size={24} />
                        <div>
                          <strong>Fieldwork doesn’t stop offline.</strong>
                          <p>
                            Your farmers, forms and saved visits stay available
                            without a connection.
                          </p>
                        </div>
                      </div>
                    </aside>
                  </div>
                </>
              )}
              {view === "map" && (
                <>
                  <PageHeading
                    title="Your project on the ground"
                    description="Farmer locations and saved boundaries across project sites."
                  />
                  <div className="panel map-page" data-tour="map">
                    <FieldMap farmers={farmers} online={online} />
                  </div>
                  <div className="boundary-cards">
                    {submissions
                      .filter((s) => s.boundary)
                      .map((s) => (
                        <button
                          className="panel boundary-card"
                          key={s.id}
                          onClick={() => navigate("profile", s.farmer_id)}
                        >
                          <BoundaryPreview polygon={s.boundary} />
                          <strong>
                            {farmers.find((f) => f.id === s.farmer_id)?.name}
                          </strong>
                          <p className="muted">
                            {areaHectares(s.boundary).toFixed(2)} ha ·{" "}
                            {dateLabel(s.created_at)}
                          </p>
                        </button>
                      ))}
                  </div>
                </>
              )}
              {view === "profile" && (
                <FarmerProfile
                  db={db}
                  farmer={farmers.find((f) => f.id === recordId)}
                  submissions={submissions.filter(
                    (s) => s.farmer_id === recordId,
                  )}
                  project={project}
                  identity={identity}
                  onBegin={beginStage}
                  online={online}
                />
              )}
              {view === "entry" && (
                <FormEntry
                  db={db}
                  submissionId={recordId}
                  project={project}
                  identity={identity}
                  lang={lang}
                  online={online}
                  onBack={() => {
                    const s = submissions.find((s) => s.id === recordId);
                    navigate("profile", s?.farmer_id);
                  }}
                />
              )}
              {view === "sync" && (
                <SyncCentre
                  db={db}
                  queue={queue}
                  online={online}
                  demo={!!identity.demo}
                  busy={busy}
                  lastSync={lastSync?.value as string | undefined}
                  shellReady={shellReady}
                  onSync={sync}
                  onError={setError}
                />
              )}
              {view === "forms" && (
                <FormLibrary db={db} project={project} lang={lang} />
              )}
              {view === "review" && (
                <ReviewQueue
                  db={db}
                  project={project}
                  farmers={farmers}
                  submissions={submissions}
                  identity={identity}
                  online={online}
                  onError={setError}
                />
              )}
              {view === "settings" && (
                <Settings
                  db={db}
                  project={project}
                  identity={identity}
                  online={online}
                  onError={setError}
                  farmers={farmers}
                  submissions={submissions}
                />
              )}
            </>
          ) : (
            <p>Opening your local workspace…</p>
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            <Sprout size={13} /> Fieldwork · Carbon project field collection
          </span>
          <span>
            {identity.demo
              ? "Demonstration workspace"
              : "Private project workspace"}
          </span>
        </footer>
      </div>
      {db && project && (
        <RegisterFarmer
          open={newFarmer}
          onOpenChange={setNewFarmer}
          db={db}
          project={project}
          identity={identity}
          onCreated={(id) => navigate("profile", id)}
        />
      )}
    </div>
  );
}

function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
function Stats({
  farmers,
  submissions,
  queue,
}: {
  farmers: Farmer[];
  submissions: Submission[];
  queue: QueueItem[];
}) {
  const stats = [
    {
      label: "Registered farmers",
      value: farmers.length,
      icon: Users,
      detail: `Across ${new Set(farmers.map((f) => f.site)).size} project sites`,
      tone: "green",
    },
    {
      label: "Field submissions",
      value: submissions.length,
      icon: FileText,
      detail: "All stages & repeat visits",
      tone: "blue",
    },
    {
      label: "Awaiting review",
      value: submissions.filter((s) => s.status === "submitted").length,
      icon: ClipboardCheck,
      detail: "Ready for supervisor review",
      tone: "amber",
    },
    {
      label: "Pending sync",
      value: queue.length,
      icon: CloudUpload,
      detail: queue.length
        ? "Safely stored on this device"
        : "No queued changes",
      tone: "slate",
    },
  ];
  return (
    <div className="stats-grid">
      {stats.map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat-top">
            <span>{s.label}</span>
            <span className={`stat-icon ${s.tone}`}>
              <s.icon size={18} />
            </span>
          </div>
          <strong>{s.value.toString().padStart(2, "0")}</strong>
          <p>{s.detail}</p>
        </div>
      ))}
    </div>
  );
}
function FarmerRegistry({
  farmers,
  submissions,
  onRegister,
  collecting,
}: {
  farmers: Farmer[];
  submissions: Submission[];
  onRegister: () => void;
  collecting: boolean;
}) {
  const [query, setQuery] = useState(""),
    [site, setSite] = useState(""),
    [stage, setStage] = useState(""),
    [sync, setSync] = useState(""),
    [tab, setTab] = useState("all"),
    [page, setPage] = useState(1);
  const pageSize = 6;
  const filtered = farmers
    .filter((f) => {
      const last = stageOf(f, submissions),
        visits = submissions.filter((s) => s.farmer_id === f.id);
      return (
        `${f.name} ${f.ref} ${f.village}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!site || f.site === site) &&
        (!stage || visits.some((s) => s.stage === stage)) &&
        (!sync ||
          f.sync_status === sync ||
          visits.some((s) => s.sync_status === sync)) &&
        (tab === "all" ||
          (tab === "review" && visits.some((s) => s.status === "submitted")) ||
          (tab === "changes" && last?.status === "needs_changes"))
      );
    })
    .sort((a, b) => a.ref.localeCompare(b.ref));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  useEffect(() => {
    setPage(1);
  }, [query, site, stage, sync, tab]);
  return (
    <section className="panel registry-panel" data-tour="farmers">
      <div className="panel-heading">
        <div className="heading-count">
          <h2>Farmer registry</h2>
          <span>{farmers.length}</span>
        </div>
        <button
          className="icon-link"
          title="Clear filters"
          aria-label="Clear filters"
          onClick={() => {
            setQuery("");
            setSite("");
            setStage("");
            setSync("");
            setTab("all");
          }}
        >
          <SlidersHorizontal size={17} />
        </button>
      </div>
      <div className="registry-tabs">
        <button
          className={tab === "all" ? "selected" : ""}
          onClick={() => setTab("all")}
        >
          All farmers
        </button>
        <button
          className={tab === "review" ? "selected" : ""}
          onClick={() => setTab("review")}
        >
          Awaiting review
        </button>
        <button
          className={tab === "changes" ? "selected" : ""}
          onClick={() => setTab("changes")}
        >
          Needs changes
        </button>
      </div>
      <div className="registry-filters">
        <label className="search-input">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, village or ID…"
            aria-label="Search farmers"
          />
        </label>
        <select
          aria-label="Filter by site"
          value={site}
          onChange={(e) => setSite(e.target.value)}
        >
          <option value="">All sites</option>
          {[...new Set(farmers.map((f) => f.site))].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Filter by stage"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          <option value="">All stages</option>
          {STAGES.map((v) => (
            <option key={v} value={v}>
              {stageLabels[v].en}
            </option>
          ))}
        </select>
        <select
          className="sync-filter"
          aria-label="Filter by sync status"
          value={sync}
          onChange={(e) => setSync(e.target.value)}
        >
          <option value="">Any sync status</option>
          {Object.entries(syncText).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="farmer-table-wrap">
        <table className="farmer-table">
          <thead>
            <tr>
              <th>Farmer</th>
              <th>Village / site</th>
              <th>Current stage</th>
              <th>Sync status</th>
              <th aria-label="Open farmer" />
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice((current - 1) * pageSize, current * pageSize)
              .map((f, i) => {
                const visit = stageOf(f, submissions);
                return (
                  <tr key={f.id}>
                    <td>
                      <button
                        className="farmer-name"
                        onClick={() => navigate("profile", f.id)}
                      >
                        <span
                          className={`avatar farmer-avatar avatar-${i % 4}`}
                        >
                          {initials(f.name)}
                        </span>
                        <span>
                          <strong>{f.name}</strong>
                          <small>{f.ref}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="village-name">{f.village}</span>
                      <small>{f.site}</small>
                    </td>
                    <td>
                      <span className="stage-name">
                        {visit ? stageLabels[visit.stage].en : "Registration"}
                      </span>
                      <Badge status={visit?.status ?? "not_started"} />
                      {visit?.stage === "consent" &&
                        visit.answers.consent_granted === false && (
                          <span className="consent-declined">
                            Consent declined
                          </span>
                        )}
                    </td>
                    <td>
                      <SyncBadge status={visit?.sync_status ?? f.sync_status} />
                    </td>
                    <td>
                      <button
                        className="row-arrow"
                        aria-label={`Open ${f.name}`}
                        onClick={() => navigate("profile", f.id)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Users size={28} />
          <h3>
            {farmers.length
              ? "No matching farmers"
              : "Start with your first farmer"}
          </h3>
          <p>
            {farmers.length
              ? "Try a different name or clear your filters."
              : "Register a farmer to begin the first baseline visit."}
          </p>
          {!farmers.length && collecting && (
            <Button onClick={onRegister}>Register farmer</Button>
          )}
        </div>
      )}
      <div className="table-footer">
        <span>
          {filtered.length
            ? `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, filtered.length)}`
            : "0"}{" "}
          of {filtered.length} farmers
        </span>
        <div className="pagination">
          <button
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              className={current === i + 1 ? "active" : ""}
              onClick={() => setPage(i + 1)}
            >
              {i + 1}
            </button>
          ))}
          <button
            aria-label="Next page"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
function StageProgress({
  submissions,
  farmers,
}: {
  submissions: Submission[];
  farmers: Farmer[];
}) {
  return (
    <section className="panel stage-progress">
      <div className="panel-heading">
        <h2>Project progress</h2>
        <Activity size={17} />
      </div>
      <p className="muted small">Farmers with an approved visit</p>
      {STAGES.map((stage, i) => {
        const count = new Set(
          submissions
            .filter((s) => s.stage === stage && s.status === "approved")
            .map((s) => s.farmer_id),
        ).size;
        return (
          <div className="stage-progress-row" key={stage}>
            <div>
              <span>
                <span className="stage-index">{i + 1}</span>
                {stageLabels[stage].en}
              </span>
              <strong>
                {count}
                <small> / {farmers.length}</small>
              </strong>
            </div>
            <div className="progress-track">
              <span
                style={{
                  width: `${farmers.length ? (count / farmers.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function SignIn({
  online,
  onSignIn,
}: {
  online: boolean;
  onSignIn: (identity: Identity) => Promise<void>;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase().auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user)
        throw new Error(error?.message ?? "Sign-in failed.");
      await onSignIn({
        id: data.user.id,
        email: data.user.email!,
        name:
          data.user.user_metadata.full_name ?? data.user.email!.split("@")[0],
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="signin-page">
      <div className="signin-story">
        <Brand />
        <div className="signin-story-body">
          <div className="signin-leaf">
            <Sprout size={58} strokeWidth={1} />
          </div>
          <h1>
            Good fieldwork.
            <br />
            Lasting impact.
          </h1>
          <p>
            One connected record for every farmer.
            <br />
            In the field. Across visits. Even offline.
          </p>
          <div className="signin-steps">
            <span>
              <Check size={17} /> Collect with confidence
            </span>
            <span>
              <Check size={17} /> Pick up where you left off
            </span>
            <span>
              <Check size={17} /> Sync when you’re connected
            </span>
          </div>
        </div>
        <small>Carbon project field collection</small>
      </div>
      <div className="signin-form">
        <span className="signin-mobile-brand">
          <Brand />
        </span>
        <div className="signin-box">
          <span className="eyebrow-icon">
            <Leaf size={19} />
          </span>
          <h2>Welcome to the field.</h2>
          <p className="muted">Sign in to download your assigned projects.</p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@organisation.org"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
            {error && (
              <div className="notice danger" role="alert">
                {error}
              </div>
            )}
            <Button disabled={busy || !online || !configured} type="submit">
              {busy ? "Signing in…" : "Sign in to workspace"}
              <ArrowRight size={17} />
            </Button>
          </form>
          {!configured && (
            <p className="setup-note">
              Cloud connection is not configured. Use the local demonstration to
              explore persistent field collection.
            </p>
          )}
          {!online && (
            <p className="error">
              Initial sign-in requires an internet connection.
            </p>
          )}
          <div className="signin-separator">
            <span>Explore the working demonstration</span>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSignIn(demoIdentity);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Sprout size={17} />
            Open local demo
            <ArrowRight size={17} />
          </Button>
          <p className="small muted demo-explainer">
            Includes synthetic farmers and repeat visits. New records are stored
            on this device; no cloud synchronization is simulated.
          </p>
          <div className="signin-security">
            <ShieldCheck size={15} /> Project access is managed by your
            administrator.
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectDownload({
  db,
  identity,
  online,
  onSelect,
  onCancel,
}: {
  db: FieldDB;
  identity: Identity;
  online: boolean;
  onSelect: (project: Project) => void;
  onCancel?: () => void;
}) {
  const [available, setAvailable] = useState<Project[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    (identity.demo
      ? db.projects.toArray()
      : online
        ? assignedProjects()
        : db.projects.toArray()
    )
      .then(setAvailable)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [db, identity, online]);
  return (
    <>
      <PageHeading
        title="Choose your field project"
        description="Download forms, farmer records, and photos before heading offline."
      />
      {onCancel && (
        <button className="back-link" onClick={onCancel}>
          <ArrowLeft size={15} />
          Back to workspace
        </button>
      )}
      {error && <div className="notice danger">{error}</div>}
      <div className="project-cards">
        {available.map((p) => (
          <div className="panel project-download-card" key={p.id}>
            <span className="project-symbol">
              <Leaf size={25} />
            </span>
            <Badge status={p.role} />
            <h2>{p.name}</h2>
            <p className="muted">{p.region}</p>
            <p>{p.sites.join(" · ")}</p>
            <Button
              disabled={!!busy || (!online && !p.downloaded_at)}
              onClick={async () => {
                setBusy(p.id);
                setError("");
                try {
                  if (!identity.demo && online) await downloadProject(db, p);
                  if (navigator.storage?.persist)
                    await navigator.storage.persist();
                  onSelect(p);
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy("");
                }
              }}
            >
              <ArrowDownToLine size={17} />
              {busy === p.id
                ? "Downloading project…"
                : p.downloaded_at
                  ? "Open downloaded project"
                  : "Download for offline use"}
            </Button>
          </div>
        ))}
      </div>
      {!available.length && (
        <div className="empty-state">
          <Users size={28} />
          <h3>
            {loading ? "Loading assigned projects…" : "No assigned projects"}
          </h3>
          <p>
            {loading
              ? "Checking your project membership."
              : "Ask your project admin to add your account, then sign in again."}
          </p>
        </div>
      )}
    </>
  );
}

function RegisterFarmer({
  open,
  onOpenChange,
  db,
  project,
  identity,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  db: FieldDB;
  project: Project;
  identity: Identity;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState(""),
    [village, setVillage] = useState(""),
    [site, setSite] = useState(project.sites[0]),
    [phone, setPhone] = useState(""),
    [gps, setGps] = useState<GPS | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!name.trim() || !village.trim())
        throw new Error("Add the farmer’s name and village.");
      const id = uid();
      await saveRecord(db, "farmer", {
        id,
        ref: `NRM-${id.slice(0, 6).toUpperCase()}`,
        project_id: project.id,
        name: name.trim(),
        village: village.trim(),
        site,
        phone: phone.trim(),
        gps,
        created_by: identity.id,
        created_at: now(),
        updated_at: now(),
        revision: 0,
        sync_status: "pending",
      });
      onOpenChange(false);
      onCreated(id);
      setName("");
      setVillage("");
      setPhone("");
      setGps(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Register a farmer"
      description="Create one permanent record for all future visits."
    >
      <form onSubmit={submit} className="register-form">
        <div className="form-grid">
          <label className="full">
            Farmer name *
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={150}
            />
          </label>
          <label>
            Village *
            <input
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              required
              maxLength={150}
            />
          </label>
          <label>
            Project site *
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              {project.sites.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="full">
            Phone number <span className="muted">(optional)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
            />
          </label>
          <div className="full">
            <label>Farmer location</label>
            <GPSCapture
              value={gps}
              onChange={setGps}
              threshold={project.gps_threshold}
            />
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="small muted">
          <ShieldCheck size={14} className="inline-icon" />
          Saved on this device first, including while offline.
        </p>
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Register farmer"}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function FarmerProfile({
  db,
  farmer,
  submissions,
  project,
  identity,
  onBegin,
  online,
}: {
  db: FieldDB;
  farmer?: Farmer;
  submissions: Submission[];
  project: Project;
  identity: Identity;
  onBegin: (f: Farmer, s: Stage) => void;
  online: boolean;
}) {
  const [selected, setSelected] = useState<Submission | null>(null);
  if (!farmer)
    return (
      <div className="empty-state">
        <h2>Farmer unavailable</h2>
        <Button onClick={() => navigate("farmers")}>Back to farmers</Button>
      </div>
    );
  const sorted = [...submissions].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
    boundary = sorted.find((s) => s.boundary);
  const consent = sorted.find(
    (s) => s.stage === "consent" && s.status !== "draft",
  );
  const collecting = project.role !== "supervisor";
  return (
    <>
      <button className="back-link" onClick={() => navigate("farmers")}>
        <ArrowLeft size={16} />
        Farmer registry
      </button>
      <div className="profile-heading">
        <span className="avatar profile-avatar">{initials(farmer.name)}</span>
        <div>
          <span className="record-ref">{farmer.ref}</span>
          <h1>{farmer.name}</h1>
          <p className="muted">
            <MapPin size={15} />
            {farmer.village}, {farmer.site} <span>·</span> Registered{" "}
            {dateLabel(farmer.created_at)}
          </p>
        </div>
        <SyncBadge status={farmer.sync_status} />
      </div>
      {consent?.answers.consent_granted === false && (
        <div className="notice danger">
          <Flag size={18} />
          <span>
            <strong>Consent declined.</strong> Recorded on{" "}
            {dateLabel(consent.created_at)}. This farmer has not agreed to
            participate.
          </span>
        </div>
      )}
      <div className="workflow-strip">
        {STAGES.map((stage, i) => {
          const visit = sorted.find((s) => s.stage === stage);
          return (
            <div
              className={`workflow-step ${visit?.status === "approved" ? "complete" : ""}`}
              key={stage}
            >
              <span className="workflow-number">
                {visit?.status === "approved" ? <Check size={18} /> : i + 1}
              </span>
              <div>
                <strong>{stageLabels[stage].en}</strong>
                <small>{workflowText[visit?.status ?? "not_started"]}</small>
              </div>
            </div>
          );
        })}
      </div>
      <div className="profile-layout">
        <section className="panel timeline-panel" data-tour="timeline">
          <div className="panel-heading">
            <div>
              <h2>Farmer timeline</h2>
              <p className="small muted">
                {submissions.length} submissions · every visit is preserved
              </p>
            </div>
          </div>
          {collecting && (
            <div className="new-visit">
              <label>
                Start a new visit
                <select id="new-stage" defaultValue="baseline">
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stageLabels[stage].en}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                onClick={() =>
                  onBegin(
                    farmer,
                    (document.getElementById("new-stage") as HTMLSelectElement)
                      .value as Stage,
                  )
                }
              >
                <Plus size={17} />
                New visit
              </Button>
            </div>
          )}
          <div className="timeline">
            {sorted.map((s) => (
              <article className="timeline-item" key={s.id}>
                <div className={`timeline-icon ${s.stage}`}>
                  <StageIcon stage={s.stage} />
                </div>
                <div className="timeline-content">
                  <div className="timeline-top">
                    <strong>{stageLabels[s.stage].en}</strong>
                    <time>{dateLabel(s.created_at)}</time>
                  </div>
                  <div className="timeline-meta">
                    <Badge status={s.status} />
                    <span>Form v{s.template_version}</span>
                    <SyncBadge status={s.sync_status} />
                  </div>
                  {s.stage === "consent" &&
                    s.answers.consent_granted === false && (
                      <p className="error">Consent declined by farmer</p>
                    )}
                  {s.reviews.at(-1)?.comment && (
                    <blockquote>{s.reviews.at(-1)!.comment}</blockquote>
                  )}
                  <p className="muted small">
                    {s.stage === "monitoring"
                      ? `${s.answers.trees_alive ?? "—"} living trees · ${s.answers.average_height ?? "—"} m average height`
                      : s.stage === "implementation"
                        ? `${s.answers.trees_planted ?? "—"} trees planted · ${s.answers.species ?? ""}`
                        : s.stage === "boundary"
                          ? `${areaHectares(s.boundary).toFixed(2)} hectares mapped`
                          : s.stage === "baseline"
                            ? `${s.answers.land_area ?? "—"} hectares · ${s.answers.household_size ?? "—"} household members`
                            : "Voluntary participation statement recorded"}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (
                        collecting &&
                        ["draft", "needs_changes"].includes(s.status) &&
                        (s.created_by === identity.id ||
                          project.role === "admin")
                      )
                        navigate("entry", s.id);
                      else setSelected(s);
                    }}
                  >
                    {["draft", "needs_changes"].includes(s.status) && collecting
                      ? "Continue visit"
                      : "View submission"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            ))}
            <article className="timeline-item">
              <div className="timeline-icon registration">
                <Users size={17} />
              </div>
              <div className="timeline-content">
                <div className="timeline-top">
                  <strong>Farmer registered</strong>
                  <time>{dateLabel(farmer.created_at)}</time>
                </div>
                <p className="muted small">
                  Permanent record created · {farmer.ref}
                </p>
              </div>
            </article>
          </div>
        </section>
        <aside>
          <div className="panel farmer-details">
            <h2>Farmer details</h2>
            <dl>
              <dt>Village</dt>
              <dd>{farmer.village}</dd>
              <dt>Project site</dt>
              <dd>{farmer.site}</dd>
              <dt>Phone</dt>
              <dd>{farmer.phone || "Not recorded"}</dd>
              <dt>GPS location</dt>
              <dd>
                {farmer.gps
                  ? `${farmer.gps.latitude.toFixed(5)}, ${farmer.gps.longitude.toFixed(5)}`
                  : "Not recorded"}
                {farmer.gps && <small>±{farmer.gps.accuracy} m accuracy</small>}
              </dd>
              <dt>Permanent ID</dt>
              <dd className="uuid">{farmer.id}</dd>
            </dl>
          </div>
          <div className="panel boundary-summary">
            <div className="panel-heading">
              <h2>Farm boundary</h2>
              <MapIcon size={17} />
            </div>
            <BoundaryPreview polygon={boundary?.boundary} />
            <div className="boundary-summary-footer">
              <strong>
                {boundary
                  ? `${areaHectares(boundary.boundary).toFixed(2)} ha`
                  : "Not mapped yet"}
              </strong>
              <span className="small muted">
                {boundary ? "Available offline" : "Start a mapping visit"}
              </span>
            </div>
          </div>
        </aside>
      </div>
      <SubmissionDialog
        db={db}
        submission={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
function StageIcon({ stage }: { stage: Stage }) {
  const Icon = {
    baseline: FileText,
    consent: ShieldCheck,
    boundary: MapIcon,
    implementation: Sprout,
    monitoring: Activity,
  }[stage];
  return <Icon size={18} />;
}

function SubmissionDialog({
  db,
  submission,
  onClose,
}: {
  db: FieldDB;
  submission: Submission | null;
  onClose: () => void;
}) {
  const template = useLiveQuery(
    () => (submission ? db.templates.get(submission.template_id) : undefined),
    [db, submission?.id],
  );
  const media =
    useLiveQuery(
      () =>
        submission
          ? db.media.where("submission_id").equals(submission.id).toArray()
          : [],
      [db, submission?.id],
    ) ?? [];
  return (
    <Dialog
      open={!!submission}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={submission ? stageLabels[submission.stage].en : "Submission"}
      description={
        submission
          ? `Collected ${dateLabel(submission.created_at)} · form v${submission.template_version}`
          : ""
      }
    >
      {submission && (
        <div className="submission-detail">
          <div className="actions">
            <Badge status={submission.status} />
            <SyncBadge status={submission.sync_status} />
          </div>
          <dl className="answer-list">
            {Object.entries(submission.answers).map(([key, value]) => (
              <div key={key}>
                <dt>
                  {template?.fields.find((f) => f.id === key)?.label.en ?? key}
                </dt>
                <dd>
                  {typeof value === "boolean"
                    ? value
                      ? "Yes"
                      : "No"
                    : typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
          {submission.boundary && (
            <BoundaryPreview polygon={submission.boundary} />
          )}
          <div className="photo-grid">
            {media.map((m) => (
              <figure key={m.id}>
                <Photo blob={m.blob} alt={m.field_id} />
                <figcaption>
                  {Math.round(m.size / 1024)} KB · {m.field_id}
                </figcaption>
              </figure>
            ))}
          </div>
          {submission.media_ids.length > media.length && (
            <p className="notice warning">
              Some photos are still awaiting upload or download.
            </p>
          )}
          {submission.reviews.map((r, i) => (
            <blockquote key={i}>
              <strong>
                {workflowText[r.status]} · {dateLabel(r.at)}
              </strong>
              <p>{r.comment}</p>
            </blockquote>
          ))}
          <small className="muted uuid">Submission ID: {submission.id}</small>
        </div>
      )}
    </Dialog>
  );
}

function SyncCentre({
  db,
  queue,
  online,
  demo,
  busy,
  lastSync,
  shellReady,
  onSync,
  onError,
}: {
  db: FieldDB;
  queue: QueueItem[];
  online: boolean;
  demo: boolean;
  busy: boolean;
  lastSync?: string;
  shellReady: boolean;
  onSync: () => Promise<void>;
  onError: (v: string) => void;
}) {
  const [conflict, setConflict] = useState<QueueItem | null>(null);
  const local = useLiveQuery(
    async () =>
      conflict
        ? (conflict.kind === "farmer" ? db.farmers : db.submissions).get(
            conflict.entity_id,
          )
        : undefined,
    [db, conflict?.id],
  );
  return (
    <>
      <PageHeading
        title="Your work, safely connected"
        description="Local saves happen first. Items are synced only after the server confirms them."
      >
        <Button disabled={busy || !online} onClick={() => void onSync()}>
          <RefreshCw size={17} className={busy ? "spin" : ""} />
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </PageHeading>
      <div className="sync-overview" data-tour="sync">
        <div className="panel">
          <span className="stat-icon green">
            <CloudUpload size={21} />
          </span>
          <strong>
            {
              queue.filter(
                (q) => q.status === "pending" || q.status === "syncing",
              ).length
            }
          </strong>
          <span>Pending items</span>
        </div>
        <div className="panel">
          <span className="stat-icon amber">
            <AlertTriangle size={21} />
          </span>
          <strong>
            {
              queue.filter(
                (q) => q.status === "failed" || q.status === "conflict",
              ).length
            }
          </strong>
          <span>Need attention</span>
        </div>
        <div className="panel last-sync">
          <span className="stat-icon slate">
            <CloudCheck size={21} />
          </span>
          <strong>
            {lastSync
              ? new Date(lastSync).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Not yet synced"}
          </strong>
          <span>
            {lastSync
              ? dateLabel(lastSync)
              : "No confirmed cloud synchronization"}
          </span>
        </div>
      </div>
      <div className="panel sync-device">
        <ShieldCheck size={28} />
        <div>
          <h2>
            {shellReady
              ? "App shell available offline"
              : "Offline app shell is not ready"}
          </h2>
          <p>
            {shellReady
              ? "Downloaded forms, records, photo blobs, and queued uploads survive reloads."
              : "Keep the app open online until its assets have finished downloading."}{" "}
            {demo
              ? "The local demo keeps synthetic data isolated from real accounts."
              : ""}
          </p>
        </div>
        <span className={`connection ${online ? "" : "is-offline"}`}>
          {online ? <Wifi size={17} /> : <WifiOff size={17} />}{" "}
          {online ? "Online" : "Offline"}
        </span>
      </div>
      <section className="panel queue-panel">
        <div className="panel-heading">
          <h2>
            Upload queue <span className="muted">({queue.length})</span>
          </h2>
          <small>Farmer → submission → photos</small>
        </div>
        {!queue.length ? (
          <div className="empty-state">
            <CloudCheck size={32} />
            <h3>No queued changes</h3>
            <p>
              {demo
                ? "Sample records are stored locally. Register a farmer or create a visit to add changes to this queue."
                : "New fieldwork will appear here after you save it."}
            </p>
          </div>
        ) : (
          queue.map((q) => (
            <div className="queue-row" key={q.id}>
              <span
                className={`queue-icon ${q.status === "conflict" || q.status === "failed" ? "warning" : ""}`}
              >
                {q.status === "conflict" || q.status === "failed" ? (
                  <AlertTriangle size={20} />
                ) : q.kind === "farmer" ? (
                  <Users size={20} />
                ) : q.kind === "media" ? (
                  <CloudUpload size={20} />
                ) : (
                  <FileText size={20} />
                )}
              </span>
              <div>
                <strong>
                  {q.kind === "farmer"
                    ? "Farmer registration"
                    : q.kind === "submission"
                      ? "Field submission"
                      : "Photo upload"}{" "}
                  <span className="muted small">{q.entity_id.slice(0, 8)}</span>
                </strong>
                <p className={q.error ? "error" : "muted"}>
                  {q.error ??
                    `${q.status === "syncing" ? "Uploading" : "Saved on this device"} · ${q.attempts} attempts`}
                </p>
              </div>
              <Badge status={q.status} />
              {q.status === "conflict" ? (
                <Button variant="outline" onClick={() => setConflict(q)}>
                  Resolve
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  disabled={busy || !online}
                  onClick={() => void onSync()}
                >
                  {q.status === "failed" ? "Retry" : "Sync"}
                </Button>
              )}
            </div>
          ))
        )}
      </section>
      <div className="sync-guidance">
        <h3>Before leaving the field</h3>
        <p>
          Keep this device’s browser data. Don’t use private browsing. If your
          session expires, sign in with the same account to sync your saved
          work. Keep the app open during synchronization.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const archives = await db.archives.toArray();
              downloadFile(
                "fieldwork-conflict-copies.json",
                JSON.stringify(archives, null, 2),
                "application/json",
              );
            } catch (e) {
              onError(errorMessage(e));
            }
          }}
        >
          <Download size={16} />
          Export preserved copies
        </Button>
      </div>
      <Dialog
        open={!!conflict}
        onOpenChange={(v) => {
          if (!v) setConflict(null);
        }}
        title="Resolve a concurrent edit"
        description="Your local copy is archived before either choice is applied."
      >
        {conflict && (
          <>
            <div className="conflict-compare">
              <div>
                <h3>Local copy</h3>
                <pre>{JSON.stringify(local, null, 2)}</pre>
              </div>
              <div>
                <h3>Server copy</h3>
                <pre>{JSON.stringify(conflict.server_copy, null, 2)}</pre>
              </div>
            </div>
            <div className="dialog-actions">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await resolveConflict(db, conflict, "server");
                    setConflict(null);
                  } catch (e) {
                    onError(errorMessage(e));
                  }
                }}
              >
                Use server copy
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await resolveConflict(db, conflict, "local");
                    setConflict(null);
                  } catch (e) {
                    onError(errorMessage(e));
                  }
                }}
              >
                Retry local changes
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

function FormLibrary({
  db,
  project,
  lang,
}: {
  db: FieldDB;
  project: Project;
  lang: Lang;
}) {
  const templates = useLiveQuery(() => db.templates.toArray(), [db]) ?? [];
  const [selected, setSelected] = useState<Template | null>(null);
  return (
    <>
      <PageHeading
        title="Forms ready for the field"
        description="Published templates are versioned. Every submission keeps the version it was collected with."
      />
      <div className="template-grid" data-tour="forms">
        {templates
          .filter((t) => t.project_id === project.id)
          .map((t) => (
            <div className="panel template-card" key={t.id}>
              <div className="template-card-top">
                <span className={`timeline-icon ${t.stage}`}>
                  <StageIcon stage={t.stage} />
                </span>
                <span className="badge badge-approved">
                  Published · v{t.version}
                </span>
              </div>
              <h2>{stageLabels[t.stage][lang]}</h2>
              <p>{t.fields.length} fields · English / हिन्दी</p>
              <p className="muted small">
                Published {dateLabel(t.published_at)}
              </p>
              <div className="template-card-footer">
                <button className="text-button" onClick={() => setSelected(t)}>
                  View fields
                  <ArrowRight size={14} />
                </button>
                <button
                  className="icon-link"
                  aria-label={`Download ${t.stage} JSON`}
                  onClick={() =>
                    downloadFile(
                      `${t.stage}-v${t.version}.json`,
                      JSON.stringify(t, null, 2),
                      "application/json",
                    )
                  }
                >
                  <Download size={17} />
                </button>
              </div>
            </div>
          ))}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
        title={selected?.name[lang] ?? "Template"}
        description="Downloaded fields and validation rules."
      >
        <div className="template-fields">
          {selected?.fields.map((f) => (
            <div key={f.id}>
              <strong>
                {f.label[lang]} {f.required ? "*" : ""}
              </strong>
              <span>
                {f.type}
                {f.min !== undefined ? ` · min ${f.min}` : ""}
                {f.max !== undefined ? ` · max ${f.max}` : ""}
              </span>
              {f.visible_when && (
                <small>
                  Visible when {f.visible_when.field} ={" "}
                  {String(f.visible_when.equals)}
                </small>
              )}
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
}

function ReviewQueue({
  db,
  project,
  farmers,
  submissions,
  identity,
  online,
  onError,
}: {
  db: FieldDB;
  project: Project;
  farmers: Farmer[];
  submissions: Submission[];
  identity: Identity;
  online: boolean;
  onError: (v: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Submission | null>(null),
    [review, setReview] = useState<Submission | null>(null),
    [comment, setComment] = useState(""),
    [outcome, setOutcome] = useState<"approved" | "needs_changes">("approved"),
    [busy, setBusy] = useState(false);
  const allowed =
    ["supervisor", "admin"].includes(project.role) && !identity.demo;
  const waiting = submissions.filter(
    (s) =>
      s.status === "submitted" &&
      (farmers.find((f) => f.id === s.farmer_id)?.name ?? "")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="A second pair of eyes"
        description="Review each submitted visit, then approve it or return it with a clear comment."
      />
      {!allowed && (
        <div className="notice">
          <ShieldCheck size={18} />
          {identity.demo
            ? "Review is read-only in the local demo. Sign in as a supervisor to review synchronized submissions."
            : "Surveyors can see the queue. Only assigned supervisors and project admins can record a review."}
        </div>
      )}
      <section className="panel" data-tour="review">
        <div className="panel-heading">
          <h2>
            Awaiting review <span className="count-pill">{waiting.length}</span>
          </h2>
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder="Search farmers…"
              aria-label="Search review queue"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {waiting.map((s) => {
          const f = farmers.find((f) => f.id === s.farmer_id);
          return (
            <div className="review-row" key={s.id}>
              <span className="avatar">{initials(f?.name ?? "?")}</span>
              <div className="review-farmer">
                <strong>{f?.name}</strong>
                <small>
                  {f?.ref} · {f?.village}
                </small>
              </div>
              <div>
                <strong>{stageLabels[s.stage].en}</strong>
                <small>
                  v{s.template_version} · {dateLabel(s.created_at)}
                </small>
              </div>
              <SyncBadge status={s.sync_status} />
              <div className="actions">
                <Button variant="outline" onClick={() => setSelected(s)}>
                  View
                </Button>
                <Button
                  disabled={!allowed || !online || s.sync_status !== "synced"}
                  onClick={() => {
                    setReview(s);
                    setComment("");
                  }}
                >
                  Review
                </Button>
              </div>
            </div>
          );
        })}
        {!waiting.length && (
          <div className="empty-state">
            <CheckCheck size={30} />
            <h3>Nothing awaiting review</h3>
            <p>Synced submissions will appear here after the next download.</p>
          </div>
        )}
      </section>
      <SubmissionDialog
        db={db}
        submission={selected}
        onClose={() => setSelected(null)}
      />
      <Dialog
        open={!!review}
        onOpenChange={(v) => {
          if (!v) setReview(null);
        }}
        title="Record your review"
        description="The surveyor will receive this result on their next sync."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!review) return;
            setBusy(true);
            try {
              const result = await reviewSubmission(
                review.id,
                review.revision,
                outcome,
                comment,
              );
              await mergeRemote(db, "submission", [result]);
              setReview(null);
            } catch (e) {
              onError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Review outcome
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as typeof outcome)}
            >
              <option value="approved">Approve submission</option>
              <option value="needs_changes">Return for changes</option>
            </select>
          </label>
          <label>
            Comment *
            <textarea
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={5000}
              placeholder="Explain what you checked or what needs to change."
            />
          </label>
          <div className="dialog-actions">
            <Button type="submit" disabled={busy || !comment.trim()}>
              {busy ? "Saving review…" : "Save review"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function Settings({
  db,
  project,
  identity,
  online,
  onError,
  farmers,
  submissions,
}: {
  db: FieldDB;
  project: Project;
  identity: Identity;
  online: boolean;
  onError: (v: string) => void;
  farmers: Farmer[];
  submissions: Submission[];
}) {
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>(
      [],
    ),
    [memberId, setMemberId] = useState(""),
    [role, setRole] = useState("surveyor"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [draft, setDraft] = useState<Template | null>(null);
  const allowed = project.role === "admin" && !identity.demo && online;
  async function loadMembers() {
    if (identity.demo || !online) return;
    const { data, error } = await supabase()
      .from("memberships")
      .select("user_id,role")
      .eq("project_id", project.id);
    if (error) onError(error.message);
    else setMembers(data ?? []);
  }
  useEffect(() => {
    void loadMembers();
  }, [project.id, online]);
  return (
    <>
      <PageHeading
        title="Project settings"
        description="Manage access and publish validated methodology templates."
      />
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="settings-layout">
        <div>
          <section className="panel settings-section">
            <h2>Project members</h2>
            <p className="muted">
              Only project admins can assign roles. Create new accounts in
              Supabase Auth first.
            </p>
            {members.map((m) => (
              <div className="member-row" key={m.user_id}>
                <span className="uuid">{m.user_id}</span>
                <Badge status={m.role} />
              </div>
            ))}
            {!members.length && (
              <p className="muted small">
                {identity.demo
                  ? "Local demo · account memberships are not simulated."
                  : "No membership list downloaded."}
              </p>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const { error } = await supabase().rpc(
                    "fieldwork_membership",
                    { p_project: project.id, p_user: memberId, p_role: role },
                  );
                  if (error) throw error;
                  await loadMembers();
                  setMemberId("");
                  setMessage("Project membership saved.");
                } catch (e) {
                  onError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset disabled={!allowed || busy}>
                <label>
                  Existing user ID
                  <input
                    value={memberId}
                    onChange={(e) => setMemberId(e.target.value)}
                    required
                    pattern="[0-9a-fA-F-]{36}"
                    placeholder="UUID from Supabase Auth"
                  />
                </label>
                <label>
                  Project role
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="surveyor">Surveyor</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Project admin</option>
                  </select>
                </label>
                <Button type="submit">Save membership</Button>
              </fieldset>
            </form>
            {!allowed && (
              <p className="small muted">
                Connect online with a project admin account to manage
                memberships.
              </p>
            )}
          </section>
          <section className="panel settings-section">
            <h2>Publish a methodology template</h2>
            <p className="muted">
              Upload a new JSON version. Published versions cannot be replaced.
            </p>
            <label className="template-upload">
              <FileJson size={25} />
              <span>Choose template JSON</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 256 * 1024)
                      throw new Error("Template must be smaller than 256 KB.");
                    const t = JSON.parse(await file.text());
                    validateTemplate(t);
                    setDraft({ ...t, project_id: project.id });
                    setMessage(
                      `Validated ${t.fields.length} bilingual fields for ${t.stage}, version ${t.version}.`,
                    );
                  } catch (e) {
                    setDraft(null);
                    onError(errorMessage(e));
                  }
                }}
              />
            </label>
            {draft && (
              <div className="notice">
                <span>
                  {draft.name.en} · v{draft.version} · {draft.fields.length}{" "}
                  fields
                </span>
              </div>
            )}
            <Button
              disabled={!allowed || !draft || busy}
              onClick={async () => {
                if (!draft) return;
                setBusy(true);
                try {
                  const { data, error } = await supabase().rpc(
                    "fieldwork_publish_template",
                    { p_template: draft },
                  );
                  if (error) throw error;
                  await db.templates.put(data);
                  setDraft(null);
                  setMessage(
                    "New template version published. Existing submissions retain their original version.",
                  );
                } catch (e) {
                  onError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Publish new version
            </Button>
          </section>
        </div>
        <aside>
          <section className="panel settings-section">
            <h2>Project details</h2>
            <dl>
              <dt>Project</dt>
              <dd>{project.name}</dd>
              <dt>Region</dt>
              <dd>{project.region}</dd>
              <dt>GPS accuracy target</dt>
              <dd>{project.gps_threshold} metres</dd>
              <dt>Downloaded</dt>
              <dd>
                {project.downloaded_at
                  ? dateLabel(project.downloaded_at)
                  : "Not yet"}
              </dd>
            </dl>
          </section>
          <section className="panel settings-section">
            <h2>Export field data</h2>
            <p className="muted">
              Exports include the records currently downloaded on this device,
              including unsynced work.
            </p>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(
                  "fieldwork-submissions.csv",
                  toCSV(farmers, submissions),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download size={16} />
              Download CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(
                  "fieldwork-boundaries.geojson",
                  JSON.stringify(toGeoJSON(farmers, submissions), null, 2),
                  "application/geo+json",
                )
              }
            >
              <MapIcon size={16} />
              Download GeoJSON
            </Button>
          </section>
        </aside>
      </div>
    </>
  );
}
