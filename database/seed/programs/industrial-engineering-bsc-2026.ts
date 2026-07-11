import type { Course, DegreePlan } from "@/types/degree";

import { applyYearbookCourseOverrides } from "../shared/yearbook-course-overrides";
import { degreePlan as previousPlan } from "./industrial-engineering-bsc";

const courseOverrides = {
  "251961": { semester: 2 },
  "51131": { semester: 6 },
  "51132": { semester: 5 },
  "51302": { semester: 4, required: true },
  "51525": { semester: 5, required: true },
  "61903": { semester: 2 },
  "11209": { prerequisites: [{ mode: "all" as const, ids: ["11003"] }], coRequisites: ["11179"] },
  "51023": { prerequisites: [{ mode: "all" as const, ids: ["51131"] }] },
  "51429": { prerequisites: [{ mode: "all" as const, ids: ["51431"] }] },
  "51430": {
    prerequisites: [{ mode: "all" as const, ids: ["51702"] }],
    coRequisites: ["51608", "51709", "51955"],
  },
  "51535": { semester: 6, type: "required" as const, required: true, prerequisites: [{ mode: "all" as const, ids: ["51525"] }] },
};

const addedRequiredCourses: Course[] = [
  {
    id: "51027",
    name: "ויזואליזציה של המידע",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 5,
    prerequisites: [{ mode: "all", ids: ["51021", "51723"] }],
  },
  {
    id: "51030",
    name: "ניתוח ותפעול של מערכות שירות",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 6,
    prerequisites: [{ mode: "all", ids: ["51021", "51703", "51724"] }],
  },
  {
    id: "51031",
    name: "תכנות מערכות מתקדם בפייתון",
    credits: 3,
    type: "required",
    required: true,
    semester: 3,
    prerequisites: [{ mode: "all", ids: ["51021"] }],
  },
  {
    id: "51913",
    name: "מבני נתונים ואלגוריתמים",
    credits: 3,
    type: "required",
    required: true,
    semester: 4,
    prerequisites: [{ mode: "all", ids: ["51031"] }],
  },
];

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "industrial-engineering-bsc-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "138-157", extractedAt: "2026-07-11" },
  courses: [...applyYearbookCourseOverrides(previousPlan.courses, courseOverrides), ...addedRequiredCourses],
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ),
};
