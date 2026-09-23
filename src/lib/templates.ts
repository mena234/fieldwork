import type { Answers, Field, Label, Stage, Template } from "./types";
export const DEMO_PROJECT = "11111111-1111-4111-8111-111111111111";
const label = (en: string, hi: string): Label => ({ en, hi });
const household = label("Farmer & household", "किसान और परिवार"),
  land = label("Land & farming", "भूमि और खेती"),
  practice = label("Current practices", "वर्तमान प्रथाएँ"),
  evidence = label("Visit & evidence", "भ्रमण और साक्ष्य");
const options = (items: string[][]) =>
  items.map(([value, en, hi]) => ({ value, label: label(en, hi) }));
const field = (
  id: string,
  en: string,
  hi: string,
  type: Field["type"],
  section: Label,
  extra: Partial<Field> = {},
): Field => ({ id, label: label(en, hi), type, section, ...extra });
const baseline: Field[] = [
  field("visit_date", "Visit date", "भ्रमण तिथि", "date", household, {
    required: true,
  }),
  field(
    "respondent",
    "Respondent name",
    "उत्तरदाता का नाम",
    "text",
    household,
    { required: true },
  ),
  field("age", "Age", "आयु", "number", household, {
    required: true,
    min: 18,
    max: 110,
  }),
  field("gender", "Gender", "लिंग", "select", household, {
    options: options([
      ["female", "Female", "महिला"],
      ["male", "Male", "पुरुष"],
      ["other", "Other / prefer not to say", "अन्य / बताना नहीं चाहते"],
    ]),
  }),
  field(
    "household_size",
    "Household members",
    "परिवार के सदस्य",
    "number",
    household,
    { required: true, min: 1, max: 40 },
  ),
  field(
    "main_income",
    "Main source of income",
    "आय का मुख्य स्रोत",
    "select",
    household,
    {
      required: true,
      options: options([
        ["farming", "Farming", "खेती"],
        ["labour", "Wage labour", "मज़दूरी"],
        ["business", "Small business", "छोटा व्यवसाय"],
        ["other", "Other", "अन्य"],
      ]),
    },
  ),
  field("land_tenure", "Land tenure", "भूमि स्वामित्व", "select", land, {
    required: true,
    options: options([
      ["owned", "Owned", "स्वयं की"],
      ["leased", "Leased", "पट्टे पर"],
      ["shared", "Shared", "साझा"],
    ]),
  }),
  field(
    "lease_years",
    "Years remaining on lease",
    "पट्टे के शेष वर्ष",
    "number",
    land,
    {
      required: true,
      min: 0,
      max: 99,
      visible_when: { field: "land_tenure", equals: "leased" },
    },
  ),
  field(
    "land_area",
    "Farm area (hectares)",
    "खेत का क्षेत्रफल (हेक्टेयर)",
    "number",
    land,
    { required: true, min: 0.01, max: 1000 },
  ),
  field("plots", "Number of plots", "खेतों की संख्या", "number", land, {
    min: 1,
    max: 100,
  }),
  field("crops", "Crops grown", "उगाई जाने वाली फसलें", "multiselect", land, {
    required: true,
    options: options([
      ["wheat", "Wheat", "गेहूँ"],
      ["rice", "Rice", "धान"],
      ["soybean", "Soybean", "सोयाबीन"],
      ["pulses", "Pulses", "दालें"],
      ["vegetables", "Vegetables", "सब्ज़ियाँ"],
    ]),
  }),
  field(
    "irrigated",
    "Is the farm irrigated?",
    "क्या खेत सिंचित है?",
    "boolean",
    land,
    { required: true },
  ),
  field(
    "water_source",
    "Irrigation water source",
    "सिंचाई जल स्रोत",
    "select",
    land,
    {
      required: true,
      visible_when: { field: "irrigated", equals: true },
      options: options([
        ["well", "Borewell / well", "बोरवेल / कुआँ"],
        ["canal", "Canal", "नहर"],
        ["rain", "Rainwater storage", "वर्षा जल भंडारण"],
      ]),
    },
  ),
  field("soil_type", "Soil type", "मिट्टी का प्रकार", "select", land, {
    options: options([
      ["black", "Black soil", "काली मिट्टी"],
      ["red", "Red soil", "लाल मिट्टी"],
      ["alluvial", "Alluvial soil", "जलोढ़ मिट्टी"],
      ["unknown", "Not known", "ज्ञात नहीं"],
    ]),
  }),
  field("existing_trees", "Existing trees", "मौजूदा पेड़", "number", practice, {
    required: true,
    min: 0,
    max: 100000,
  }),
  field(
    "tree_species",
    "Existing tree species",
    "मौजूदा वृक्ष प्रजातियाँ",
    "text",
    practice,
  ),
  field(
    "fertiliser",
    "Fertiliser use",
    "उर्वरक उपयोग",
    "multiselect",
    practice,
    {
      options: options([
        ["organic", "Organic manure", "जैविक खाद"],
        ["chemical", "Chemical fertiliser", "रासायनिक उर्वरक"],
        ["none", "None", "कोई नहीं"],
      ]),
    },
  ),
  field(
    "residue_burning",
    "Crop residues burned?",
    "क्या फसल अवशेष जलाते हैं?",
    "boolean",
    practice,
    { required: true },
  ),
  field("livestock", "Livestock count", "पशुओं की संख्या", "number", practice, {
    min: 0,
    max: 1000,
  }),
  field(
    "agroforestry_interest",
    "Interested in agroforestry?",
    "क्या कृषि वानिकी में रुचि है?",
    "boolean",
    practice,
    { required: true },
  ),
  field(
    "visit_gps",
    "Visit GPS location",
    "भ्रमण जीपीएस स्थान",
    "gps",
    evidence,
  ),
  field("farm_photo", "Farm photo", "खेत का फोटो", "photo", evidence),
  field("notes", "Field notes", "क्षेत्र टिप्पणियाँ", "text", evidence),
  field("collector", "Collected by", "संग्रहकर्ता", "text", evidence, {
    required: true,
  }),
];
const short: Record<Exclude<Stage, "baseline">, Field[]> = {
  consent: [
    field(
      "consent_granted",
      "Consent granted",
      "सहमति दी गई",
      "boolean",
      evidence,
      { required: true },
    ),
    field("consent_date", "Consent date", "सहमति तिथि", "date", evidence, {
      required: true,
    }),
    field(
      "collector",
      "Statement explained by",
      "कथन समझाने वाला",
      "text",
      evidence,
      { required: true },
    ),
    field("language", "Language used", "प्रयुक्त भाषा", "select", evidence, {
      required: true,
      options: options([
        ["hi", "Hindi", "हिन्दी"],
        ["en", "English", "अंग्रेज़ी"],
        ["local", "Local language", "स्थानीय भाषा"],
      ]),
    }),
    field(
      "notes",
      "Questions or reasons for declining",
      "प्रश्न या अस्वीकार करने के कारण",
      "text",
      evidence,
    ),
    field(
      "evidence_photo",
      "Consent evidence (optional)",
      "सहमति साक्ष्य (वैकल्पिक)",
      "photo",
      evidence,
    ),
  ],
  boundary: [
    field("visit_date", "Mapping date", "मानचित्रण तिथि", "date", evidence, {
      required: true,
    }),
    field("collector", "Mapped by", "मानचित्रकार", "text", evidence, {
      required: true,
    }),
    field("notes", "Boundary notes", "सीमा टिप्पणियाँ", "text", evidence),
  ],
  implementation: [
    field("visit_date", "Visit date", "भ्रमण तिथि", "date", evidence, {
      required: true,
    }),
    field(
      "trees_planted",
      "Trees planted",
      "लगाए गए पेड़",
      "number",
      evidence,
      { required: true, min: 0, max: 100000 },
    ),
    field(
      "species",
      "Species planted",
      "लगाई गई प्रजातियाँ",
      "text",
      evidence,
      { required: true },
    ),
    field(
      "practice",
      "Practice introduced",
      "शुरू की गई प्रथा",
      "select",
      evidence,
      {
        required: true,
        options: options([
          ["agroforestry", "Agroforestry", "कृषि वानिकी"],
          ["soil", "Soil improvement", "मृदा सुधार"],
          ["water", "Water conservation", "जल संरक्षण"],
        ]),
      },
    ),
    field(
      "photo",
      "Implementation photo",
      "क्रियान्वयन फोटो",
      "photo",
      evidence,
    ),
    field("collector", "Collected by", "संग्रहकर्ता", "text", evidence, {
      required: true,
    }),
    field("notes", "Field notes", "क्षेत्र टिप्पणियाँ", "text", evidence),
  ],
  monitoring: [
    field("visit_date", "Monitoring date", "निगरानी तिथि", "date", evidence, {
      required: true,
    }),
    field("trees_alive", "Living trees", "जीवित पेड़", "number", evidence, {
      required: true,
      min: 0,
      max: 100000,
    }),
    field(
      "average_height",
      "Average height (metres)",
      "औसत ऊँचाई (मीटर)",
      "number",
      evidence,
      { min: 0, max: 100 },
    ),
    field(
      "issues",
      "Issues observed?",
      "क्या समस्याएँ देखी गईं?",
      "boolean",
      evidence,
      { required: true },
    ),
    field(
      "issue_details",
      "Describe the issues",
      "समस्याओं का विवरण",
      "text",
      evidence,
      { required: true, visible_when: { field: "issues", equals: true } },
    ),
    field(
      "visit_gps",
      "Visit GPS location",
      "भ्रमण जीपीएस स्थान",
      "gps",
      evidence,
    ),
    field("photo", "Monitoring photo", "निगरानी फोटो", "photo", evidence),
    field("collector", "Collected by", "संग्रहकर्ता", "text", evidence, {
      required: true,
    }),
    field("notes", "Field notes", "क्षेत्र टिप्पणियाँ", "text", evidence),
  ],
};
export function sampleTemplates(projectId = DEMO_PROJECT): Template[] {
  return (
    [
      "baseline",
      "consent",
      "boundary",
      "implementation",
      "monitoring",
    ] as Stage[]
  ).map((stage, i) => ({
    id: `22222222-2222-4222-8222-${String(i + 1).padStart(12, "0")}`,
    project_id: projectId,
    stage,
    version: 1,
    name: label(
      `${stage[0].toUpperCase() + stage.slice(1)} · v1`,
      `${{ baseline: "आधारभूत", consent: "सहमति", boundary: "सीमा", implementation: "क्रियान्वयन", monitoring: "निगरानी" }[stage]} · v1`,
    ),
    fields: stage === "baseline" ? baseline : short[stage],
    published_at: "2026-08-01T00:00:00Z",
    ...(stage === "consent"
      ? {
          consent_statement: label(
            "We have explained the project, proposed activities, expected benefits, possible risks, and the voluntary nature of participation. You may ask questions or decline. This demonstration statement must be adapted to the project and community before field use.",
            "हमने परियोजना, प्रस्तावित गतिविधियाँ, अपेक्षित लाभ, संभावित जोखिम और स्वैच्छिक भागीदारी समझाई है। आप प्रश्न पूछ सकते हैं या मना कर सकते हैं। क्षेत्र में उपयोग से पहले इस प्रदर्शन कथन को परियोजना और समुदाय के अनुसार अनुकूलित करें।",
          ),
        }
      : {}),
  }));
}
export const visible = (field: Field, answers: Answers) =>
  !field.visible_when ||
  answers[field.visible_when.field] === field.visible_when.equals;
export function validateAnswers(
  template: Template,
  answers: Answers,
  mediaFields: string[] = [],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of template.fields.filter((f) => visible(f, answers))) {
    const v = answers[f.id];
    const missing =
      f.type === "photo"
        ? !mediaFields.includes(f.id)
        : v === undefined ||
          v === null ||
          v === "" ||
          (Array.isArray(v) && !v.length);
    if (f.required && missing) {
      errors[f.id] = "required";
      continue;
    }
    if (missing) continue;
    if (
      f.type === "number" &&
      (typeof v !== "number" ||
        !Number.isFinite(v) ||
        (f.min !== undefined && v < f.min) ||
        (f.max !== undefined && v > f.max))
    )
      errors[f.id] = "range";
    if (f.type === "boolean" && typeof v !== "boolean")
      errors[f.id] = "invalid";
    if (
      f.type === "date" &&
      (typeof v !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      errors[f.id] = "invalid";
    if (f.type === "text" && (typeof v !== "string" || v.length > 5000))
      errors[f.id] = "invalid";
    if (f.type === "select" && !f.options?.some((o) => o.value === v))
      errors[f.id] = "invalid";
    if (
      f.type === "multiselect" &&
      (!Array.isArray(v) ||
        v.some((x) => !f.options?.some((o) => o.value === x)))
    )
      errors[f.id] = "invalid";
    if (
      f.type === "gps" &&
      (v === null ||
        typeof v !== "object" ||
        Array.isArray(v) ||
        !("latitude" in v) ||
        !Number.isFinite(v.latitude) ||
        Math.abs(v.latitude) > 90 ||
        !Number.isFinite(v.longitude) ||
        Math.abs(v.longitude) > 180 ||
        !Number.isFinite(v.accuracy) ||
        v.accuracy < 0 ||
        !Number.isFinite(Date.parse(v.timestamp)))
    )
      errors[f.id] = "invalid";
  }
  return errors;
}
export function validateTemplate(value: unknown): asserts value is Template {
  if (!value || typeof value !== "object")
    throw new Error("Upload a JSON object.");
  const t = value as Template;
  if (
    ![
      "baseline",
      "consent",
      "boundary",
      "implementation",
      "monitoring",
    ].includes(t.stage) ||
    !Number.isInteger(t.version) ||
    t.version < 1 ||
    !t.name?.en ||
    !t.name?.hi ||
    !Array.isArray(t.fields) ||
    !t.fields.length ||
    t.fields.length > 50
  )
    throw new Error(
      "Template needs a stage, positive version, English/Hindi name, and 1–50 fields.",
    );
  const ids = new Set<string>();
  for (const f of t.fields) {
    if (
      !/^[a-z][a-z0-9_]{0,49}$/.test(f.id) ||
      ids.has(f.id) ||
      !f.label?.en ||
      !f.label?.hi ||
      !f.section?.en ||
      !f.section?.hi ||
      ![
        "text",
        "number",
        "date",
        "select",
        "multiselect",
        "boolean",
        "gps",
        "photo",
      ].includes(f.type)
    )
      throw new Error(
        "Fields need unique IDs, valid types, and English/Hindi labels and sections.",
      );
    ids.add(f.id);
    if (
      ["select", "multiselect"].includes(f.type) &&
      (!f.options?.length ||
        f.options.some((o) => !o.value || !o.label?.en || !o.label?.hi) ||
        new Set(f.options.map((o) => o.value)).size !== f.options.length)
    )
      throw new Error("Select fields require unique bilingual options.");
    if (
      (f.min !== undefined && !Number.isFinite(f.min)) ||
      (f.max !== undefined && !Number.isFinite(f.max)) ||
      (f.min !== undefined && f.max !== undefined && f.min > f.max)
    )
      throw new Error("Invalid number range.");
    if (
      f.visible_when &&
      (!ids.has(f.visible_when.field) ||
        f.visible_when.field === f.id ||
        !["string", "boolean"].includes(typeof f.visible_when.equals))
    )
      throw new Error(
        "Conditions must reference an earlier field and match a string or boolean.",
      );
  }
  if (
    t.stage === "consent" &&
    (!t.consent_statement?.en || !t.consent_statement?.hi)
  )
    throw new Error("Consent templates need a bilingual statement.");
}
