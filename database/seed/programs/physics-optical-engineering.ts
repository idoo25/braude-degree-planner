import type { Course, DegreePlan } from "@/types/degree";

// NOTE: The physics & optical engineering chapter in the source yearbook (see
// docs/degree-programs/physics-optical-engineering-prerequisites.md) contains no
// semester-by-semester degree curriculum for this program - only a department
// description and a flat table of physics "service courses" taught by this
// department to other engineering departments. No prerequisite/corequisite data
// exists for these courses in the source, so none is fabricated here.

const courses: Course[] = [
  {
    id: "11179",
    name: "מבוא לפיזיקה אקדמית",
    credits: 0,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 4, תרגיל 2.",
      "קורס שירות של המחלקה לפיזיקה והנדסה אופטית; אינו משויך לסמסטר או לתוכנית לימודים מוגדרת.",
    ],
  },
  {
    id: "11023",
    name: "פיזיקה 1ב",
    credits: 3,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2, תרגיל 1, מעבדה 1.",
      "ניתן למחלקת ביוטכנולוגיה.",
    ],
  },
  {
    id: "11026",
    name: "פיזיקה 2ב",
    credits: 3,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2, תרגיל 1, מעבדה 1.",
      "ניתן למחלקת ביוטכנולוגיה.",
    ],
  },
  {
    id: "11027",
    name: "פיזיקה 3ב",
    credits: 3,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2, תרגיל 1, מעבדה 1.",
      "ניתן למחלקת ביוטכנולוגיה.",
    ],
  },
  {
    id: "11209",
    name: "פיזיקה 1 IE",
    credits: 3.5,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2, תרגיל 2, מעבדה 1.",
      "ניתן למחלקת תעשייה וניהול.",
    ],
  },
  {
    id: "11210",
    name: "פיזיקה 2 IE",
    credits: 4,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 3, תרגיל 2.",
      "ניתן למחלקת תעשייה וניהול.",
    ],
  },
  {
    id: "11212",
    name: "פיזיקה 2 מכ",
    credits: 4.5,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 3, תרגיל 2, מעבדה 1.",
      "ניתן למחלקת מכונות.",
    ],
  },
  {
    id: "11213",
    name: "פיזיקה 3 מכ",
    credits: 3,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2, תרגיל 1, מעבדה 1.",
      "ניתן למחלקת מכונות.",
    ],
  },
  {
    id: "11231",
    name: "פיזיקה 1 מ",
    credits: 4.5,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 3, תרגיל 2, מעבדה 1.",
      "ניתן למחלקת חשמל ואלקטרוניקה.",
    ],
  },
  {
    id: "11232",
    name: "פיזיקה 2 מ",
    credits: 4.5,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 3, תרגיל 2, מעבדה 1.",
      "ניתן למחלקת חשמל ואלקטרוניקה.",
    ],
  },
  {
    id: "11233",
    name: "פיזיקה 3 מ",
    credits: 4,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 3, תרגיל 1, מעבדה 1.",
      "ניתן למחלקת חשמל ואלקטרוניקה.",
    ],
  },
  {
    id: "61179",
    name: "מבוא לפיזיקה אקדמית להנדסת תוכנה",
    credits: 0,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 4, תרגיל 2.",
      "ניתן למחלקות תוכנה, מערכות מידע.",
    ],
  },
  {
    id: "61180",
    name: "פיזיקה להנדסת תוכנה ל",
    credits: 3,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2, תרגיל 2.",
      "ניתן למחלקות תוכנה, מערכות מידע.",
    ],
  },
  {
    id: "61181",
    name: "פיזיקה להנדסת תוכנה",
    credits: 3,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2, תרגיל 2.",
      "ניתן למחלקות תוכנה, מערכות מידע.",
    ],
  },
  {
    id: "421208",
    name: "פיזיקה 1 אז'",
    credits: 3.5,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2, תרגיל 2, מעבדה 1.",
      "ניתן למחלקת הנדסה אזרחית.",
    ],
  },
  {
    id: "421209",
    name: "פיזיקה 2 אז'",
    credits: 3.5,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2, תרגיל 2, מעבדה 1.",
      "ניתן למחלקת הנדסה אזרחית.",
    ],
  },
  {
    id: "11198",
    name: "פיזיקה מודרנית",
    credits: 3,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 3.",
      "ניתן למחלקת תעשייה וניהול וכקורס בחירה כללי.",
    ],
  },
  {
    id: "11214",
    name: "תגליות מדעיות ששינו את החשיבה האנושית",
    credits: 2,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2.",
      "ניתן למחלקת תעשייה וניהול וכקורס בחירה כללי.",
    ],
  },
  {
    id: "11215",
    name: "עקרונות מדעיים בשירות הטכנולוגיה",
    credits: 2,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2.",
      "ניתן למחלקת תעשייה וניהול וכקורס בחירה כללי.",
    ],
  },
  {
    id: "11216",
    name: "סימטריות בטבע",
    credits: 2,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2.",
      "ניתן למחלקת תעשייה וניהול וכקורס בחירה כללי.",
    ],
  },
  {
    id: "11217",
    name: "נושאים נבחרים בפיזיקה",
    credits: 2,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 2.",
      "ניתן למחלקת תעשייה וניהול וכקורס בחירה כללי.",
    ],
  },
  {
    id: "61989",
    name: "מחשבים קוונטיים",
    credits: 3,
    type: "elective",
    notes: [
      "שעות שבועיות: הרצאה 3.",
      "ניתן למחלקות תוכנה, מערכות מידע וכקורס בחירה כללי.",
    ],
  },
];

export const degreePlan: DegreePlan = {
  id: "physics-optical-engineering",
  title: "פיזיקה והנדסה אופטית",
  subtitle:
    "המכללה האקדמית להנדסה בראודה - תוכנית לימודים לא נמצאה במהדורת השנתון הנוכחית (מוצגת רשימת קורסי שירות בלבד)",
  source: {
    fileName: "שנתון תשפ\"ד 2024-2023 - בראודה.pdf",
    pages: "133-135",
    extractedAt: "2026-07-10",
  },
  requirements: {
    totalCredits: 0,
    fixedDegreeCredits: 0,
    electiveCreditsNeeded: 0,
    generalCredits: 0,
    sportCredits: 0,
    englishRequiredIds: [],
  },
  courseTypes: [
    { code: "required", label: "חובה", sortOrder: 0 },
    { code: "elective", label: "בחירה", sortOrder: 1 },
    { code: "general", label: "כללי", sortOrder: 2 },
    { code: "sport", label: "ספורט", sortOrder: 3 },
    { code: "english", label: "אנגלית", sortOrder: 4 },
    { code: "placement", label: "סיווג/פטור", sortOrder: 5 },
    { code: "conversion", label: "המרה", sortOrder: 6 },
  ],
  requirementGroups: [],
  clusters: [],
  courses,
  rules: [],
  notes: [
    "תוכנית לימודים מלאה עבור תואר זה לא נמצאה במהדורת השנתון הנוכחית - הנתונים המוצגים כוללים רק את רשימת קורסי השירות של המחלקה.",
    "פרק זה בשנתון (עמ' 133-135) כולל תיאור מחלקה ורשימת קורסי פיזיקה הניתנים כקורסי שירות למחלקות אחרות, ללא טבלת סמסטרים 1-8 וללא עמודת קורסי קדם/קורסים צמודים.",
    "לפרטים על ההיקף והמתודולוגיה של החיפוש ראו docs/degree-programs/physics-optical-engineering-prerequisites.md.",
  ],
};
