import type { Course, DegreePlan } from "@/types/degree";

import { degreePlan as previousPlan } from "./msc-biotechnology";

const courses = previousPlan.courses
  .filter((course) => course.id !== "43106")
  .map((course) =>
    course.id === "43105"
      ? { ...course, semester: 4 }
      : course
  );

const addedScheduledCourses: Course[] = [
  {
    id: "43405",
    name: "תקינה תכנון וניהול ניסויים קליניים",
    credits: 0,
    type: "required",
    required: true,
    semester: 2,
  },
  {
    id: "43105",
    name: "טכנולוגיות תאים ורקמות",
    credits: 0,
    type: "required",
    required: true,
    semester: 4,
  },
];

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "msc-biotechnology-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "172-176", extractedAt: "2026-07-11" },
  courses: [...courses, ...addedScheduledCourses],
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ),
};
