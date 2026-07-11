import type { Course, DegreePlan } from "@/types/degree";

import { degreePlan as previousPlan } from "./msc-systems-engineering";

const removedCourseIds = new Set(["53116", "53321", "53331"]);

const addedScheduledCourses: Course[] = [
  {
    id: "53429",
    name: "אינטגרציית אדם מערכת",
    credits: 3,
    type: "required",
    required: true,
    semester: 2,
  },
  {
    id: "53344",
    name: "שיטות בפיתוח מערכות",
    credits: 3,
    type: "required",
    required: true,
    semester: 3,
  },
];

const courses = previousPlan.courses
  .filter((course) => !removedCourseIds.has(course.id))
  .map((course) => (course.id === "53311" ? { ...course, credits: 3 } : course));

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "msc-systems-engineering-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "177-181", extractedAt: "2026-07-11" },
  courses: [...courses, ...addedScheduledCourses],
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ).concat(
    "בשנתון תשפ\"ו יש פער בין סכום שורות רצף ההמלצה לבין דרישת הזכאות המפורשת של 41 נק\"ז; דרישת הזכאות הרשמית נשמרה במערכת."
  ),
};
