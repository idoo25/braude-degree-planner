import type { Course, DegreePlan } from "@/types/degree";

import { applyYearbookCourseOverrides } from "../shared/yearbook-course-overrides";
import { degreePlan as previousPlan } from "./teaching-general-studies";

// Pages 161-169 are a current-year catalog, not one fixed semester sequence.
// Keep only its explicit 2025-26 course rows in the active catalog; the prior,
// broader catalog remains available as the archived 2023-24 program.
const activeSourceCourseIds = new Set([
  "81280", "81281", "81282", "81283", "81284", "81285", "81287", "81288", "81289", "81291", "81293", "81294", "81295", "81296", "81297", "81298",
  "81320", "81355", "81360", "81373", "81380", "81383", "81387", "81399", "81403", "81404", "81410", "81411", "81419", "81430", "81431", "81556", "81561", "81578", "81671", "85381", "85390",
  "11281", "11282", "11283", "11284", "11337", "11347", "11348", "11352", "11354", "11375", "11386", "11499", "11565", "11568", "11569", "11575", "11578", "11871", "11874",
  "11073", "11091", "11092", "11431", "11432", "11490",
]);

const courseOverrides = {
  "81287": { credits: 3, prerequisites: [], coRequisites: ["81288"] },
  "81288": { prerequisites: [], coRequisites: ["81287"] },
  "81285": { prerequisites: [], coRequisites: ["81287"] },
  "81289": { prerequisites: [{ mode: "all" as const, ids: ["81287", "81285", "81288"] }] },
  "81294": { prerequisites: [{ mode: "all" as const, ids: ["81287", "81288"] }] },
  "81320": { prerequisites: [{ mode: "all" as const, ids: ["81287", "81285", "81288"] }] },
  "81383": { prerequisites: [{ mode: "all" as const, ids: ["81287", "81285", "81288", "81380"] }] },
  "81387": { prerequisites: [{ mode: "all" as const, ids: ["81383"] }] },
  "81578": { type: "required" as const, required: true },
  "81671": { type: "required" as const, required: true },
};

const addedCatalogCourses: Course[] = [
  { id: "81380", name: "דרכי הוראת המקצוע", credits: 3, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81287", "81285", "81288"] }] },
  { id: "81297", name: "למידה משמעותית ופיתוח חשיבה", credits: 2, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81287"] }] },
  { id: "81298", name: "היבטים בחינוך הנדסי", credits: 3, type: "required", required: true },
  { id: "81296", name: "דרכי הוראת הגיאומטריה", credits: 3, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81287", "81288"] }] },
  { id: "81295", name: "דרכי הוראת האלגברה", credits: 3, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81287", "81288"] }] },
  { id: "81293", name: "היבטים בהוראת המתמטיקה - מאיפה ולאן", credits: 3, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81287", "81288"] }], notes: ["יש לבחור גם אחד מהקורסים 81295 או 81296; לפי השנהון ניתן ללמוד במקביל."] },
  { id: "81403", name: "התנסות מעשית בהוראת מתמטיקה והנדסה משולב - 1", credits: 10, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81287", "81285", "81288"] }, { mode: "any", ids: ["81380", "81295", "81296"], label: "אחד מקורסי המתודיקה" }] },
  { id: "81404", name: "התנסות מעשית בהוראת מתמטיקה והנדסה משולב - 2", credits: 10, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81403"] }] },
  { id: "85381", name: "מבוא להוראה מוטת עתיד", credits: 2, type: "required", required: true },
  { id: "81294", name: "סמינריון במחקר חינוכי", credits: 3, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81287", "81288"] }] },
  { id: "85390", name: "היבטים בחינוך הנדסי", credits: 2, type: "required", required: true },
  { id: "81355", name: "למידה מוטת עתיד בחינוך העל יסודי", credits: 2, type: "required", required: true },
  { id: "81280", name: "מבוא להוראת המקצועות העיוניים וההתנסותיים", credits: 2, type: "required", required: true },
  { id: "81430", name: "התנסות מעשית להנדסאים 1", credits: 6, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81399", "81285", "81380"] }] },
  { id: "81431", name: "התנסות מעשית להנדסאים 2", credits: 6, type: "required", required: true, prerequisites: [{ mode: "all", ids: ["81430"] }] },
  { id: "81419", name: "השתלמות ביטחון, בטיחות, זהב, נגישות וחיים בטוחים", credits: 0, type: "required", required: true },
  { id: "11284", name: "דילמות פילוסופיות בחינוך: הגות ומעשה", credits: 2, type: "elective" },
  { id: "11354", name: "אתיקה ובינה מלאכותית", credits: 2, type: "elective" },
  { id: "11499", name: "אילוצים כמנוף לחדשנות בהשראת הטבע", credits: 2, type: "elective" },
  { id: "11871", name: "שילוב טכנולוגיות מתקדמות בהוראה ובהדרכה", credits: 2, type: "elective" },
  { id: "11432", name: "חדר כושר לנפש", credits: 1, type: "sport" },
];

const sourceCourses = [
  ...applyYearbookCourseOverrides(previousPlan.courses, courseOverrides).filter((course) => activeSourceCourseIds.has(course.id)),
  ...addedCatalogCourses,
].map((course) => {
  if (course.type === "sport") {
    return { ...course, clusterId: "sport", requirementGroup: "sport" };
  }
  if (["11281", "11282", "11283", "11284", "11337", "11347", "11348", "11352", "11354", "11375", "11386", "11499", "11565", "11568", "11569", "11575", "11578", "11871", "11874"].includes(course.id)) {
    return { ...course, type: "elective" as const, required: false, clusterId: "general-studies", requirementGroup: "general-studies" };
  }
  return {
    ...course,
    type: "required" as const,
    required: true,
    clusterId: "teaching-certificate",
    requirementGroup: undefined,
  };
});

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "teaching-general-studies-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "158-169", extractedAt: "2026-07-11" },
  clusters: [
    { id: "teaching-certificate", name: "קורסי תעודת הוראה", minCourses: 1, note: "הקטלוג כולל כמה מסלולי תעודת הוראה; יש לבחור את המסלול מול יועץ אקדמי." },
    { id: "general-studies", name: "לימודים כלליים", minCourses: 3, note: "נדרשות 6 נק\"ז בלימודים כלליים לתארי ההנדסה." },
    { id: "sport", name: "ספורט", minCourses: 1 },
  ],
  requirementGroups: [
    { code: "general-studies", name: "לימודים כלליים", kind: "credits", requiredCredits: 6 },
    { code: "sport", name: "ספורט", kind: "credits", requiredCredits: 1 },
  ],
  courses: sourceCourses,
  rules: [],
  notes: [
    "זהו קטלוג תשפ\"ו של תעודת הוראה, לימודים כלליים וספורט; אין בו רצף סמסטרים מחייב אחד לכל הסטודנטים.",
    "דרישות המסלול המדויקות בתעודת הוראה נקבעות לפי מסלול ההסמכה והרקע האקדמי, כמפורט בשנתון בעמ' 161-166.",
  ],
};
