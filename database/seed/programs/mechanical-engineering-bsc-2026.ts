import type { Course, DegreePlan } from "@/types/degree";

import { applyYearbookCourseOverrides } from "../shared/yearbook-course-overrides";
import { degreePlan as previousPlan } from "./mechanical-engineering-bsc";

const courseOverrides = {
  "11212": {
    prerequisites: [{ mode: "all" as const, ids: ["11001", "22511"] }],
    coRequisites: ["11005"],
  },
  "22520": {
    prerequisites: [{ mode: "all" as const, ids: ["11133", "22310", "22512"] }],
    coRequisites: [],
  },
  "22715": {
    prerequisites: [{ mode: "all" as const, ids: ["22205", "22310", "22400"] }],
  },
};

const academicHebrewCourses: Course[] = [
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
  id: "mechanical-engineering-bsc-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "94-108", extractedAt: "2026-07-11" },
  courses: [...applyYearbookCourseOverrides(previousPlan.courses, courseOverrides), ...academicHebrewCourses],
  courseTypes: [...previousPlan.courseTypes, { code: "language", label: "עברית אקדמית", sortOrder: 7 }],
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ),
};
