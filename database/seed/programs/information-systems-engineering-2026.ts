import type { Course, DegreePlan } from "@/types/degree";

import { applyYearbookCourseOverrides } from "../shared/yearbook-course-overrides";
import { degreePlan as previousPlan } from "./information-systems-engineering";

const courseOverrides = {
  "11069": { semester: 5 },
  "61179": { semester: 4 },
  "61180": { semester: 4 },
  "61181": { semester: 4 },
  "61765": { semester: 7, type: "required" as const, required: true },
  "51956": {
    semester: 6,
    prerequisites: [{ mode: "all" as const, ids: ["61832"] }],
    coRequisites: ["11006", "61753"],
  },
  "51957": { semester: 3, prerequisites: [], coRequisites: ["61830"] },
  "61743": { prerequisites: [], coRequisites: ["61741"] },
  "61756": {
    semester: 5,
    prerequisites: [
      { mode: "any" as const, ids: ["11060", "ENG_ADV_B_OK"], label: "אנגלית מתקדמים ב או פטור/סיווג" },
      { mode: "all" as const, ids: ["61751", "61755"] },
    ],
    coRequisites: ["61757", "61769"],
  },
  "61757": {
    prerequisites: [
      { mode: "any" as const, ids: ["11060", "ENG_ADV_B_OK"], label: "אנגלית מתקדמים ב או פטור/סיווג" },
      { mode: "all" as const, ids: ["61751", "61755"] },
    ],
    coRequisites: ["61756", "61769"],
  },
  "61761": { prerequisites: [{ mode: "all" as const, ids: ["61832"] }], coRequisites: ["61753"] },
  "61762": { semester: 6, prerequisites: [{ mode: "all" as const, ids: ["61750"] }], coRequisites: ["61830"] },
  "61769": {
    prerequisites: [
      { mode: "any" as const, ids: ["11060", "ENG_ADV_B_OK"], label: "אנגלית מתקדמים ב או פטור/סיווג" },
      { mode: "all" as const, ids: ["61751", "61755"] },
    ],
    coRequisites: ["61756", "61757"],
  },
  "61778": { prerequisites: [{ mode: "all" as const, ids: ["11006"] }], coRequisites: ["61743"] },
  "61834": {
    semester: 6,
    prerequisites: [{ mode: "all" as const, ids: ["61755"] }],
    coRequisites: ["61753"],
  },
  "61981": {
    semester: 6,
    type: "required" as const,
    required: true,
    prerequisites: [{ mode: "all" as const, ids: ["61751"] }],
    coRequisites: ["51957"],
  },
  "61998": {
    prerequisites: [
      { mode: "all" as const, ids: ["11069", "61761", "61762", "61776", "61836", "61981", "62009"] },
      { mode: "any" as const, ids: ["61180", "61181"], label: "אחת מחלופות הפיזיקה" },
    ],
  },
};

const addedRequiredCourses: Course[] = [
  {
    id: "61832",
    name: "מבוא להסתברות וסטטיסטיקה",
    credits: 4,
    type: "required",
    required: true,
    semester: 3,
    prerequisites: [{ mode: "all", ids: ["11006", "61743"] }],
  },
  {
    id: "61836",
    name: "שיטות סטטיסטיות ותהליכים סטוכסטיים",
    credits: 3,
    type: "required",
    required: true,
    semester: 5,
    prerequisites: [{ mode: "all", ids: ["61832", "61911"] }],
  },
  {
    id: "62009",
    name: "תכנות למערכות מידע מבוזרות",
    credits: 3,
    type: "required",
    required: true,
    semester: 5,
    prerequisites: [{ mode: "all", ids: ["61752", "61911"] }],
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
    semester: 2,
    prerequisites: [{ mode: "all", ids: ["11360"] }],
    notes: ["קורס מותנה בהתאם לסיווג בעברית בשנתון תשפ\"ו."],
  },
];

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "information-systems-engineering-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "128-137", extractedAt: "2026-07-11" },
  courses: [...applyYearbookCourseOverrides(previousPlan.courses, courseOverrides), ...addedRequiredCourses],
  courseTypes: [...previousPlan.courseTypes, { code: "language", label: "עברית אקדמית", sortOrder: 7 }],
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ),
};
