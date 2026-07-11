import type { Course, DegreePlan } from "@/types/degree";

import { applyYearbookCourseOverrides } from "../shared/yearbook-course-overrides";
import { degreePlan as previousPlan } from "./applied-mathematics";

const courseOverrides = {
  "11059": { semester: 2 },
  "11006": {
    prerequisites: [{ mode: "all" as const, ids: ["11004"] }],
    coRequisites: ["11102"],
  },
  "11209": { semester: 4, prerequisites: [{ mode: "all" as const, ids: ["11004"] }], coRequisites: ["11179"] },
  "201006": { prerequisites: [{ mode: "all" as const, ids: ["11121"] }], coRequisites: ["201008"] },
  "201008": { prerequisites: [{ mode: "all" as const, ids: ["201174"] }], coRequisites: ["201176"] },
  "201009": {
    prerequisites: [{ mode: "all" as const, ids: ["11006", "11121"] }],
    coRequisites: ["11102"],
  },
  "201015": {
    semester: 3,
    prerequisites: [{ mode: "all" as const, ids: ["11102"] }],
    coRequisites: ["61743"],
  },
  "201163": {
    prerequisites: [{ mode: "all" as const, ids: ["11121"] }],
    coRequisites: ["201008", "51900"],
  },
  "201174": { prerequisites: [{ mode: "all" as const, ids: ["11102"] }] },
  "201176": {
    prerequisites: [{ mode: "all" as const, ids: ["11006"] }],
    coRequisites: ["11102"],
  },
  "201178": { semester: 5 },
  "51900": { semester: 2 },
  "61739": { semester: 3 },
  "61753": { semester: 4, type: "required" as const, required: true },
  "61759": { semester: 6, type: "required" as const, required: true },
  "61761": {
    semester: 5,
    type: "required" as const,
    required: true,
    prerequisites: [{ mode: "all" as const, ids: ["61753"] }],
    coRequisites: ["61760"],
  },
  "61778": { semester: 3, type: "required" as const, required: true },
};

const addedRequiredCourses: Course[] = [
  { id: "11102", name: "אלגברה 1מח", credits: 4, type: "required", required: true, semester: 1 },
  {
    id: "11121",
    name: "משוואות דיפרנציאליות רגילות",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 2,
    prerequisites: [{ mode: "all", ids: ["11004", "11102"] }],
  },
  {
    id: "201029",
    name: "אנליזה קומפלקסית",
    credits: 4,
    type: "required",
    required: true,
    semester: 4,
    prerequisites: [{ mode: "all", ids: ["201176"] }],
  },
  { id: "201155", name: "חשיבה מתמטית", credits: 2, type: "required", required: true, semester: 1 },
  {
    id: "61760",
    name: "הסתברות להנדסת תוכנה",
    credits: 4,
    type: "elective",
    notes: ["מופיע כתנאי קדם לקורס 61761 בשנתון תשפ\"ו, אך אינו מופיע במסלול החובה של מתמטיקה שימושית."],
  },
  {
    id: "11360",
    name: "עברית אקדמית א'",
    credits: 0,
    type: "language",
    semester: 1,
    notes: ["קורס מותנה בהתאם לסיווג בעברית בשנתון תשפ\"ו."],
  },
  {
    id: "11361",
    name: "עברית אקדמית ב'",
    credits: 0,
    type: "language",
    semester: 1,
    prerequisites: [{ mode: "all", ids: ["11360"] }],
    notes: ["קורס מותנה בהתאם לסיווג בעברית בשנתון תשפ\"ו."],
  },
];

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "applied-mathematics-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "109-117", extractedAt: "2026-07-11" },
  courses: [...applyYearbookCourseOverrides(previousPlan.courses, courseOverrides), ...addedRequiredCourses],
  courseTypes: [...previousPlan.courseTypes, { code: "language", label: "עברית אקדמית", sortOrder: 7 }],
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ),
};
