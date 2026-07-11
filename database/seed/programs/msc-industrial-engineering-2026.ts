import type { Course, DegreePlan } from "@/types/degree";

import { degreePlan as previousPlan } from "./msc-industrial-engineering";

const levelingNote = "קורס השלמה אפשרי בהתאם לדיסציפלינת התואר הראשון, לפי טבלת השנתון תשפ\"ו.";

const levelingCourses: Course[] = [
  { id: "51131", name: "ניהול מערכות ייצור", credits: 4, type: "placement", notes: [levelingNote] },
  { id: "51132", name: "תכנון ותפעול תהליך האספקה בארגון", credits: 4, type: "placement", notes: [levelingNote] },
  { id: "51702", name: "מודלים דטרמיניסטיים בחקר ביצועים", credits: 3.5, type: "placement", notes: [levelingNote] },
  { id: "51728", name: "הבטחת איכות", credits: 2, type: "placement", notes: [levelingNote] },
  { id: "51605", name: "מבוא לכלכלה למהנדסים", credits: 2, type: "placement", notes: [levelingNote] },
  { id: "51618", name: "חשבונאות ניהולית", credits: 2.5, type: "placement", notes: [levelingNote] },
  { id: "51617", name: "חשבונאות פיננסית", credits: 2.5, type: "placement", notes: [levelingNote] },
  { id: "51429", name: "אפיון וניתוח מערכות מידע", credits: 4, type: "placement", notes: [levelingNote] },
  { id: "51430", name: "תכנון פרויקטים וניהולם", credits: 3, type: "placement", notes: [levelingNote] },
  { id: "51213", name: "ניהול איכות סטטיסטי", credits: 4, type: "placement", notes: [levelingNote] },
  { id: "51215", name: "תכן שיטות עבודה", credits: 4, type: "placement", notes: [levelingNote] },
  { id: "51141", name: "מיב\"מ", credits: 2.5, type: "placement", notes: [levelingNote] },
  { id: "51723", name: "סטטיסטיקה", credits: 4, type: "placement", notes: [levelingNote] },
  { id: "51724", name: "סימולציה ספרתית", credits: 3, type: "placement", notes: [levelingNote] },
  { id: "51432", name: "תכנון וניהול מערכות ארגוניות", credits: 2.5, type: "placement", notes: [levelingNote] },
  { id: "51431", name: "מבוא למערכות ארגוניות", credits: 2.5, type: "placement", notes: [levelingNote] },
  { id: "51136", name: "תכן מערך העבודה", credits: 3, type: "placement", notes: [levelingNote] },
];

const courses = previousPlan.courses
  .filter((course) => course.type !== "placement")
  .map((course) =>
    course.id === "53110"
      ? { ...course, name: "עבודת גמר - חלק א'", credits: 3, semester: 3 }
      : course
  );

const finalProjectPartTwo: Course = {
  id: "FINAL_PROJECT_2",
  name: "עבודת גמר - חלק ב'",
  credits: 3,
  type: "required",
  required: true,
  semester: 4,
};

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "msc-industrial-engineering-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "185-189", extractedAt: "2026-07-11" },
  courses: [...courses, finalProjectPartTwo, ...levelingCourses],
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ),
};
