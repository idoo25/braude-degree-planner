import type { Course, DegreePlan } from "@/types/degree";

import { applyYearbookCourseOverrides } from "../shared/yearbook-course-overrides";
import { degreePlan as previousPlan } from "./civil-engineering";

const legacyTransitionCourseIds = new Set(["11124", "22130", "421111", "421220", "500121"]);

function retainLegacyTransitionCourse(course: Course): Course {
  if (!legacyTransitionCourseIds.has(course.id)) {
    return course;
  }

  return {
    ...course,
    required: false,
    semester: undefined,
    notes: [...(course.notes ?? []), "חלופת מעבר לשנתונים קודמים; אינה נבחרת אוטומטית בשנתון תשפ\"ו."],
  };
}

const yearbookCourses: Course[] = [
  {
    id: "421108",
    name: "עיקרי תכן אדריכלי 1",
    credits: 1,
    type: "required",
    required: true,
    semester: 2,
  },
  {
    id: "11133",
    name: "משוואות דיפרנציאליות",
    credits: 4,
    type: "required",
    required: true,
    semester: 3,
    prerequisites: [{ mode: "all", ids: ["11005"] }],
  },
  {
    id: "421224",
    name: "מעבדה בחוזק, חומרים וסטטיקת מבנים",
    credits: 1.5,
    type: "required",
    required: true,
    semester: 4,
    prerequisites: [{ mode: "all", ids: ["421112", "22400", "421217"] }],
  },
  {
    id: "421225",
    name: "אנליזה נומרית",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 5,
    prerequisites: [{ mode: "all", ids: ["11133", "421223"] }],
  },
  {
    id: "51600",
    name: "מבוא לכלכלה",
    credits: 4,
    type: "elective",
    clusterId: "structural-electives-group2",
    prerequisites: [{ mode: "all", ids: ["11003"] }],
  },
];

const courseOverrides = {
  "11061": { semester: 4 },
  "251961": { semester: 2 },
  "421109": { semester: 3 },
  "421208": { semester: 1 },
  "421209": { semester: 5 },
  "421213": { semester: 2 },
  "421217": { semester: 3 },
  "421317": { semester: 6 },
  "421211": { prerequisites: [], coRequisites: ["421113"] },
  "421214": { semester: 4, prerequisites: [{ mode: "all" as const, ids: ["421210", "421217"] }], coRequisites: [] },
  "421219": { prerequisites: [{ mode: "all" as const, ids: ["421210"] }], coRequisites: ["421217"] },
  "421222": { semester: 5, prerequisites: [{ mode: "all" as const, ids: ["421211"] }], coRequisites: ["421221"] },
  "421223": { semester: 2, prerequisites: [], coRequisites: ["11001", "11003"] },
  "421310": {
    prerequisites: [{ mode: "all" as const, ids: ["421111", "421214"] }],
    coRequisites: ["421109", "421314"],
  },
  "421315": { prerequisites: [{ mode: "all" as const, ids: ["421112", "421216"] }], coRequisites: ["11133"] },
  "421316": { semester: 4, prerequisites: [{ mode: "all" as const, ids: ["421223"] }], coRequisites: ["421217"] },
  "421318": { prerequisites: [], coRequisites: ["421221"] },
  "421319": { prerequisites: [], coRequisites: ["421221"] },
  "421322": { prerequisites: [], coRequisites: ["41079"] },
  "421326": {
    prerequisites: [{ mode: "all" as const, ids: ["421213", "421312", "421314"] }],
    coRequisites: ["421315"],
  },
  "421410": { prerequisites: [{ mode: "all" as const, ids: ["421326", "421328"] }], coRequisites: ["421324"] },
  "421414": { prerequisites: [], coRequisites: ["421210"] },
  "421415": { prerequisites: [{ mode: "all" as const, ids: ["421412"] }], coRequisites: ["421410"] },
  "51750": { semester: 4, prerequisites: [{ mode: "all" as const, ids: ["11005"] }], coRequisites: ["11001"] },
};

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "civil-engineering-2026",
  subtitle:
    "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026), תוכנית חדשה בהיתר המל\"ג",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: {
    fileName: "שנתון תשפ\"ו 2025-2026",
    pages: "56-68",
    extractedAt: "2026-07-11",
  },
  courses: [
    ...applyYearbookCourseOverrides(previousPlan.courses, courseOverrides).map(retainLegacyTransitionCourse),
    ...yearbookCourses,
  ],
  notes: [
    "התוכנית נפתחה בהיתר המועצה להשכלה גבוהה; הענקת התואר מותנית באישורה.",
    ...previousPlan.notes.map((note) =>
      note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
    ),
  ],
};
