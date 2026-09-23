"use client";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CloudUpload,
  FileText,
  ImagePlus,
  Save,
} from "lucide-react";
import type { FieldDB } from "@/lib/db";
import { addPhoto, saveRecord } from "@/lib/db";
import type {
  Answers,
  Answer,
  GPS,
  Identity,
  Lang,
  Project,
  Submission,
  Template,
} from "@/lib/types";
import { stageLabels } from "@/lib/types";
import { validateAnswers, visible } from "@/lib/templates";
import { validatePolygon } from "@/lib/geometry";
import { compressPhoto } from "@/lib/photos";
import { errorMessage, now, uid } from "@/lib/utils";
import { Button } from "./ui/button";
import { BoundaryEditor, GPSCapture } from "./map";
export function Photo({ blob, alt }: { blob?: Blob; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={alt} />
    </a>
  ) : (
    <div className="photo-empty">Photo not downloaded</div>
  );
}
export function FormEntry({
  db,
  submissionId,
  project,
  identity,
  lang,
  online,
  onBack,
}: {
  db: FieldDB;
  submissionId: string;
  project: Project;
  identity: Identity;
  lang: Lang;
  online: boolean;
  onBack: () => void;
}) {
  const s = useLiveQuery(
    () => db.submissions.get(submissionId),
    [db, submissionId],
  );
  const template = useLiveQuery(async () => {
    const current = await db.submissions.get(submissionId);
    return current ? db.templates.get(current.template_id) : undefined;
  }, [db, submissionId]);
  const farmer = useLiveQuery(
    async () => (s ? db.farmers.get(s.farmer_id) : undefined),
    [db, s?.farmer_id],
  );
  const media =
    useLiveQuery(
      () => db.media.where("submission_id").equals(submissionId).toArray(),
      [db, submissionId],
    ) ?? [];
  const [answers, setAnswers] = useState<Answers>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [saveState, setSaveState] = useState("Saved on this device"),
    [photoBusy, setPhotoBusy] = useState(false),
    [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (s) setAnswers(s.answers);
  }, [s?.id]);
  if (!s || !template)
    return <div className="empty-state">Opening saved form…</div>;
  const editable =
    ["draft", "needs_changes"].includes(s.status) &&
    (s.created_by === identity.id || project.role === "admin");
  const sections = [...new Set(template.fields.map((f) => f.section[lang]))];
  async function patch(update: Partial<Submission>) {
    setSaveState(lang === "hi" ? "सहेज रहे हैं…" : "Saving…");
    try {
      await db.transaction(
        "rw",
        [db.farmers, db.submissions, db.media, db.queue],
        async () => {
          const current = await db.submissions.get(submissionId);
          if (current)
            await saveRecord(db, "submission", {
              ...current,
              ...update,
              status: update.status ?? "draft",
            });
        },
      );
      setSaveState(
        lang === "hi" ? "इस डिवाइस पर सहेजा गया" : "Saved on this device",
      );
    } catch (e) {
      setSaveState("Save failed");
      setMessage(errorMessage(e));
      throw e;
    }
  }
  async function change(key: string, value: Answer) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (errors[key]) setErrors({ ...errors, [key]: "" });
    try {
      await patch({ answers: next });
    } catch {
      /* visible save failure */
    }
  }
  async function attach(file: File, fieldId: string) {
    setPhotoBusy(true);
    setMessage("");
    try {
      const blob = await compressPhoto(file),
        id = uid();
      await addPhoto(db, {
        id,
        project_id: project.id,
        submission_id: submissionId,
        field_id: fieldId,
        blob,
        size: blob.size,
        path: `${project.id}/${submissionId}/${id}.jpg`,
        uploaded: false,
        created_by: identity.id,
        created_at: now(),
        updated_at: now(),
        revision: 0,
        sync_status: "pending",
      });
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  }
  async function submit() {
    setSubmitting(true);
    setMessage("");
    try {
      const current = await db.submissions.get(submissionId);
      if (!current) return;
      const validation = validateAnswers(
        template!,
        answers,
        media.map((m) => m.field_id),
      );
      if (current.stage === "boundary") {
        const boundaryError = validatePolygon(current.boundary);
        if (boundaryError) validation.boundary = boundaryError;
      }
      if (Object.keys(validation).length) {
        setErrors(validation);
        setMessage(
          lang === "hi"
            ? "चिह्नित प्रश्नों को पूरा करें।"
            : "Complete the highlighted questions before submitting.",
        );
        document
          .querySelector('[aria-invalid="true"]')
          ?.scrollIntoView({ block: "center" });
        return;
      }
      await patch({ answers, status: "submitted", submitted_at: now() });
      onBack();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="form-page">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        {farmer?.name ?? "Farmer profile"}
      </button>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">
            {farmer?.ref} <ChevronRight size={13} />{" "}
            {lang === "hi" ? "नया भ्रमण" : "Field visit"}
          </div>
          <h1>{stageLabels[s.stage][lang]}</h1>
          <p className="muted">
            {template.name[lang]} ·{" "}
            {lang === "hi"
              ? "प्रपत्र का संस्करण इस भ्रमण के लिए सुरक्षित है।"
              : "This visit retains its original form version."}
          </p>
        </div>
        <span className="local-save" role="status">
          <Check size={15} />
          {saveState}
        </span>
      </div>
      {!editable && (
        <div className="notice">
          This submission is {s.status.replace("_", " ")}. Previous visits are
          preserved; start a new visit from the farmer profile.
        </div>
      )}
      {template.consent_statement && (
        <div className="consent-statement">
          <FileText size={21} />
          <div>
            <h3>{lang === "hi" ? "सहमति कथन" : "Consent statement"}</h3>
            <p>{template.consent_statement[lang]}</p>
            <small>
              {lang === "hi"
                ? "यह कार्यप्रवाह प्रदर्शन है; कानूनी अनुपालन का प्रमाण नहीं है।"
                : "Workflow demonstration only; this form does not establish legal compliance."}
            </small>
          </div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={!editable || submitting}>
          <div className="form-layout">
            <div>
              {sections.map((section, sectionIndex) => (
                <section className="form-section" key={section}>
                  <div className="form-section-title">
                    <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
                    <div>
                      <h2>{section}</h2>
                      <p className="muted small">
                        {lang === "hi"
                          ? "* चिह्नित प्रश्न आवश्यक हैं"
                          : "Fields marked * are required"}
                      </p>
                    </div>
                  </div>
                  <div className="form-grid">
                    {template.fields
                      .filter(
                        (f) =>
                          f.section[lang] === section && visible(f, answers),
                      )
                      .map((f) => {
                        const v = answers[f.id],
                          id = `field-${f.id}`;
                        return (
                          <div
                            className={`form-field ${["gps", "photo"].includes(f.type) ? "full" : ""}`}
                            key={f.id}
                          >
                            <label htmlFor={id}>
                              {f.label[lang]}
                              {f.required && (
                                <span className="required"> *</span>
                              )}
                            </label>
                            {["text", "number", "date"].includes(f.type) && (
                              <input
                                id={id}
                                type={f.type === "text" ? "text" : f.type}
                                value={
                                  typeof v === "string" || typeof v === "number"
                                    ? v
                                    : ""
                                }
                                min={f.min}
                                max={f.max}
                                step={f.type === "number" ? "any" : undefined}
                                aria-required={f.required}
                                aria-invalid={Boolean(errors[f.id])}
                                aria-describedby={`${id}-error`}
                                onChange={(e) =>
                                  void change(
                                    f.id,
                                    f.type === "number"
                                      ? e.target.value === ""
                                        ? null
                                        : Number(e.target.value)
                                      : e.target.value,
                                  )
                                }
                              />
                            )}
                            {f.type === "select" && (
                              <select
                                id={id}
                                value={String(v ?? "")}
                                aria-required={f.required}
                                aria-invalid={Boolean(errors[f.id])}
                                onChange={(e) =>
                                  void change(f.id, e.target.value)
                                }
                              >
                                <option value="">
                                  {lang === "hi"
                                    ? "विकल्प चुनें"
                                    : "Select an option"}
                                </option>
                                {f.options?.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label[lang]}
                                  </option>
                                ))}
                              </select>
                            )}
                            {f.type === "boolean" && (
                              <div
                                className="choice-group"
                                role="group"
                                aria-label={f.label[lang]}
                                aria-invalid={Boolean(errors[f.id])}
                              >
                                {[true, false].map((value) => (
                                  <button
                                    type="button"
                                    key={String(value)}
                                    className={`choice ${v === value ? "selected" : ""}`}
                                    aria-pressed={v === value}
                                    onClick={() => void change(f.id, value)}
                                  >
                                    <span className="radio-dot" />
                                    {value
                                      ? lang === "hi"
                                        ? "हाँ"
                                        : "Yes"
                                      : lang === "hi"
                                        ? "नहीं"
                                        : "No"}
                                  </button>
                                ))}
                              </div>
                            )}
                            {f.type === "multiselect" && (
                              <div
                                className="multi-options"
                                aria-invalid={Boolean(errors[f.id])}
                              >
                                {f.options?.map((o) => (
                                  <label className="check-option" key={o.value}>
                                    <input
                                      type="checkbox"
                                      checked={
                                        Array.isArray(v) && v.includes(o.value)
                                      }
                                      onChange={(e) =>
                                        void change(
                                          f.id,
                                          e.target.checked
                                            ? [
                                                ...(Array.isArray(v) ? v : []),
                                                o.value,
                                              ]
                                            : (Array.isArray(v)
                                                ? v
                                                : []
                                              ).filter((x) => x !== o.value),
                                        )
                                      }
                                    />
                                    {o.label[lang]}
                                  </label>
                                ))}
                              </div>
                            )}
                            {f.type === "gps" && (
                              <GPSCapture
                                value={v as GPS | null}
                                lang={lang}
                                threshold={project.gps_threshold}
                                onChange={(gps) => void change(f.id, gps)}
                              />
                            )}
                            {f.type === "photo" && (
                              <>
                                <label
                                  className={`photo-upload ${photoBusy ? "disabled" : ""}`}
                                >
                                  <ImagePlus size={22} />
                                  <span>
                                    {photoBusy
                                      ? lang === "hi"
                                        ? "फोटो तैयार हो रहा है…"
                                        : "Preparing photo…"
                                      : lang === "hi"
                                        ? "फोटो लें या अपलोड करें"
                                        : "Take or upload a photo"}
                                    <small>
                                      {lang === "hi"
                                        ? "प्रति भ्रमण अधिकतम 3 फोटो"
                                        : "Up to 3 photos per visit · compressed toward 300 KB"}
                                    </small>
                                  </span>
                                  <input
                                    id={id}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    disabled={photoBusy || media.length >= 3}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) void attach(file, f.id);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                                <div className="photo-grid">
                                  {media
                                    .filter((m) => m.field_id === f.id)
                                    .map((m) => (
                                      <figure key={m.id}>
                                        <Photo
                                          blob={m.blob}
                                          alt={f.label[lang]}
                                        />
                                        <figcaption>
                                          {Math.round(m.size / 1024)} KB ·{" "}
                                          {m.sync_status === "synced"
                                            ? "Synced"
                                            : "Stored locally"}
                                        </figcaption>
                                      </figure>
                                    ))}
                                </div>
                              </>
                            )}
                            {errors[f.id] && (
                              <small className="error" id={`${id}-error`}>
                                {errors[f.id] === "required"
                                  ? lang === "hi"
                                    ? "यह प्रश्न आवश्यक है।"
                                    : "This field is required."
                                  : errors[f.id] === "range"
                                    ? lang === "hi"
                                      ? `${f.min ?? "−∞"} और ${f.max ?? "∞"} के बीच संख्या दर्ज करें।`
                                      : `Enter a number between ${f.min ?? "−∞"} and ${f.max ?? "∞"}.`
                                    : lang === "hi"
                                      ? "मान्य उत्तर दर्ज करें।"
                                      : "Enter a valid answer."}
                              </small>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </section>
              ))}
              {s.stage === "boundary" && (
                <section className="form-section">
                  <h2>Farmer boundary</h2>
                  <BoundaryEditor
                    value={s.boundary}
                    vertexGps={s.vertex_gps}
                    online={online}
                    threshold={project.gps_threshold}
                    onChange={(boundary, vertex_gps) =>
                      void patch({ boundary, vertex_gps }).catch(() => {})
                    }
                  />
                  {errors.boundary && (
                    <p className="error">{errors.boundary}</p>
                  )}
                </section>
              )}
            </div>
            <aside className="form-side">
              <div className="form-help">
                <Save size={21} />
                <h3>
                  {lang === "hi"
                    ? "आपका काम सुरक्षित है"
                    : "Your work stays with you"}
                </h3>
                <p>
                  {lang === "hi"
                    ? "हर बदलाव इस डिवाइस पर सहेजा जाता है। ऑनलाइन होने पर सिंक करें।"
                    : "Every change is saved on this device. You can leave this form and continue offline."}
                </p>
                <hr />
                <span>
                  {lang === "hi" ? "प्रपत्र संस्करण" : "Form version"}{" "}
                  <strong>v{template.version}</strong>
                </span>
                <span>
                  {lang === "hi" ? "किसान संदर्भ" : "Farmer reference"}{" "}
                  <strong>{farmer?.ref}</strong>
                </span>
                <span>
                  {lang === "hi" ? "कनेक्शन" : "Connection"}{" "}
                  <strong>{online ? "Online" : "Offline"}</strong>
                </span>
              </div>
            </aside>
          </div>
        </fieldset>
        {message && (
          <div className="notice danger" role="alert">
            {message}
          </div>
        )}
        {editable && (
          <div className="form-footer">
            <span className="local-save">
              <Check size={16} />
              {saveState}
            </span>
            <div className="actions">
              <Button type="button" variant="outline" onClick={onBack}>
                {lang === "hi" ? "ड्राफ्ट छोड़ें" : "Save & close"}
              </Button>
              <Button type="submit" disabled={submitting || photoBusy}>
                <CloudUpload size={17} />
                {submitting
                  ? lang === "hi"
                    ? "सहेज रहे हैं…"
                    : "Saving…"
                  : lang === "hi"
                    ? "समीक्षा हेतु जमा करें"
                    : "Submit for review"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
