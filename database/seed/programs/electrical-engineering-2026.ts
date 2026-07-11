import type { Course, DegreePlan } from "@/types/degree";

import { applyYearbookCourseOverrides } from "../shared/yearbook-course-overrides";
import { degreePlan as previousPlan } from "./electrical-engineering";

const courseOverrides = {
  "31017": {
    prerequisites: [{ mode: "all" as const, ids: ["31403"] }],
    coRequisites: ["31521", "31842"],
  },
  "31101": {
    required: false,
    requirementGroup: "engineering-design-stage-a",
    coRequisites: ["31017"],
  },
  "31102": {
    prerequisites: [{ mode: "any" as const, ids: ["31100", "31101"], label: "מסלול תכן הנדסי א מתאים" }],
    coRequisites: [],
  },
  "31103": {
    prerequisites: [{ mode: "any" as const, ids: ["31100", "31101"], label: "מסלול תכן הנדסי א מתאים" }],
    coRequisites: ["11233", "31442", "31451", "31521"],
  },
  "31104": {
    prerequisites: [{ mode: "any" as const, ids: ["31100", "31101"], label: "מסלול תכן הנדסי א מתאים" }],
    coRequisites: ["31711", "31910", "31999"],
  },
  "31401": { prerequisites: [{ mode: "all" as const, ids: ["31350"] }], coRequisites: [] },
  "31521": { prerequisites: [{ mode: "all" as const, ids: ["31401", "31511"] }], coRequisites: [] },
  "31910": { prerequisites: [{ mode: "all" as const, ids: ["11122", "31421"] }] },
  "31999": { prerequisites: [{ mode: "all" as const, ids: ["31705"] }] },
};

const addedRequiredCourses: Course[] = [
  {
    id: "31100",
    name: "תכן הנדסי א' - פרויקט גמר",
    credits: 3,
    type: "required",
    required: false,
    semester: 7,
    requirementGroup: "engineering-design-stage-a",
    coRequisites: ["31017"],
  },
  {
    id: "31705",
    name: 'שדות א"מ ותמסורת גלים',
    credits: 4,
    type: "required",
    required: true,
    semester: 4,
    prerequisites: [{ mode: "all", ids: ["11232", "31316"] }],
  },
  {
    id: "31842",
    name: "אלקטרוניקה יישומית",
    credits: 3,
    type: "required",
    required: true,
    semester: 6,
    prerequisites: [{ mode: "all", ids: ["31401"] }],
  },
];

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "electrical-engineering-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "79-93", extractedAt: "2026-07-11" },
  courses: [...applyYearbookCourseOverrides(previousPlan.courses, courseOverrides), ...addedRequiredCourses],
  requirementGroups: [
    ...previousPlan.requirementGroups,
    {
      code: "engineering-design-stage-a",
      name: "תכן הנדסי א' - בחירת מסלול",
      kind: "alternative",
      minCourses: 1,
      courseIds: ["31100", "31101"],
    },
  ],
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ),
};
