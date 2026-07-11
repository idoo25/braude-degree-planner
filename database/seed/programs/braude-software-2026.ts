import type { Course, DegreePlan } from "@/types/degree";

import { degreePlan as previousPlan } from "./braude-software-2020";

const semesterFourCourseIds = new Set(["61179", "61180", "61181"]);
const removedCourseIds = new Set(["11158", "61760"]);

const courses = previousPlan.courses
  .filter((course) => !removedCourseIds.has(course.id))
  .map((course) => {
    if (semesterFourCourseIds.has(course.id)) {
      return { ...course, semester: 4 };
    }

    if (course.id === "61762") {
      return { ...course, semester: 6 };
    }

    if (course.id === "61756" || course.id === "61757" || course.id === "61769") {
      return {
        ...course,
        prerequisites: [
          { mode: "any" as const, ids: ["11060", "ENG_ADV_B_OK"], label: "אנגלית מתקדמים ב או פטור/סיווג" },
          { mode: "all" as const, ids: ["61751", "61755"] },
        ],
      };
    }

    if (course.id === "61761" || course.id === "61775") {
      return { ...course, prerequisites: [{ mode: "all" as const, ids: ["61753", "61832"] }] };
    }

    if (course.id === "61998") {
      return {
        ...course,
        prerequisites: [
          { mode: "all" as const, ids: ["11069", "61756", "61759", "61761", "61762", "61775", "61776"] },
          { mode: "any" as const, ids: ["61180", "61181"], label: "אחת מחלופות הפיזיקה" },
        ],
      };
    }

    return course;
  });

const probabilityAndStatisticsCourse = {
  id: "61832",
  name: "מבוא להסתברות וסטטיסטיקה",
  credits: 4,
  type: "required" as const,
  required: true,
  semester: 5,
  prerequisites: [{ mode: "all" as const, ids: ["11129", "61911"] }],
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
    semester: 2,
    prerequisites: [{ mode: "all", ids: ["11360"] }],
    notes: ["קורס מותנה בהתאם לסיווג בעברית בשנתון תשפ\"ו."],
  },
];

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "braude-software-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "118-127", extractedAt: "2026-07-11" },
  courses: [...courses, probabilityAndStatisticsCourse, ...academicHebrewCourses],
  courseTypes: [...previousPlan.courseTypes, { code: "language", label: "עברית אקדמית", sortOrder: 7 }],
  requirementGroups: previousPlan.requirementGroups.map((group) =>
    group.code === "physics" ? { ...group, courseIds: ["61180", "61181"] } : group
  ),
  rules: previousPlan.rules.map((rule) => {
    if (rule.id === "physics-alternative-mutual-exclusion") {
      return {
        ...rule,
        message: "ניתן לבחור חלופת פיזיקה אחת בלבד: 61180 (בצמוד ל-61179) או 61181.",
        payload: { courseIds: ["61180", "61181"], maxSelected: 1 },
      };
    }

    if (rule.id === "physics-intro-lab-mutual-exclusion") {
      return {
        ...rule,
        message: "קורס 61179 נלמד רק בצמוד ל-61180; אינו תואם ל-61181.",
        payload: { courseIds: ["61179", "61181"], maxSelected: 1 },
      };
    }

    return rule;
  }),
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ),
};
