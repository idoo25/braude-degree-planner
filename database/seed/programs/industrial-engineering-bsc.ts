import type { Course, DegreePlan, ElectiveCluster } from "@/types/degree";

const generalAndSportCourses = require("../shared/general-and-sport-courses.json") as {
  general: { id: string; name: string; credits: number }[];
  sport: { id: string; name: string; credits: number }[];
};

const generalStudiesCourses: Course[] = generalAndSportCourses.general.map((course) => ({
  ...course,
  type: "general",
  required: false,
  requirementGroup: "general-studies",
}));

const sportCourses: Course[] = generalAndSportCourses.sport.map((course) => ({
  ...course,
  type: "sport",
  required: false,
  requirementGroup: "sport-elective",
}));

/**
 * Structural note on modeling the two specializations (התמחויות):
 * Track A (מדעי הנתונים / Data Science) and Track B (תכן ותפעול של מערכות ייצור ושירות)
 * share semesters 1-2 entirely and share several individual courses in semesters 3-7.
 * Track-exclusive mandatory courses are tagged with requirementGroup "track-a" / "track-b"
 * (see requirementGroups below) rather than clusterId, because clusterId in this codebase
 * is reserved for elective "choose N of M" pools (see braude-software-2020.ts's "sciences"
 * etc.), whereas a track is a "take ALL of these instead of ALL of those" choice - closer in
 * spirit to the "physics alternative" requirementGroup pattern in braude-software-2020.ts,
 * just scaled up to ~12-15 courses per side instead of 1. Elective *pools* proper (science-
 * tech cluster, the two tracks' elective clusters, management cluster) use clusterId exactly
 * like the software program.
 */

const clusters: ElectiveCluster[] = [
  {
    id: "science-tech",
    name: "אשכול מדע וטכנולוגיה",
    minCourses: 1,
    note: "משותף לשני המסלולים - קורס אחד חובה מתוך האשכול.",
  },
  {
    id: "data-science-electives",
    name: "קורסי בחירה - מסלול מדעי הנתונים",
    minCourses: 4,
    note: "יש לבחור 4 או 5 קורסים (בהתאם לנ\"ז שנצברות) כדי להשלים ל-160 נ\"ז; חלק מהקורסים משותפים גם לאשכולות הבחירה של מסלול ב'.",
  },
  {
    id: "production-service-design",
    name: "אשכול תכן ותפעול של מערכות ייצור ושירות",
    minCourses: 3,
    note: "מסלול ב' בלבד. נתיב התמחות בתעשייה: לפחות 3 קורסים מהאשכול. נתיב פרויקט גמר: לפחות 4 קורסים מהאשכול.",
  },
  {
    id: "info-systems-data-science",
    name: "אשכול מערכות מידע ומדע הנתונים",
    minCourses: 1,
    note: "מסלול ב'; חלק מהקורסים משותפים גם לרשימת הבחירה של מסלול א'.",
  },
  {
    id: "management",
    name: "אשכול ניהול",
    minCourses: 1,
    note: "מסלול ב'.",
  },
];

const p = (ids: string[], label?: string) => ({ mode: "all" as const, ids, label });
const any = (ids: string[], label: string) => ({
  mode: "any" as const,
  ids,
  label,
});

const courses: Course[] = [
  // ---------------------------------------------------------------------
  // English placement / exemption pseudo-courses (mirrors braude-software-2020.ts)
  // ---------------------------------------------------------------------
  {
    id: "ENG_BASIC_OK",
    name: "פטור/סיווג מאנגלית בסיסית",
    credits: 0,
    type: "placement",
    notes: ["מיועד לסטודנטים שאינם צריכים ללמוד 11063 בפועל (ציון פסיכומטרי 85-99 ומעלה)."],
  },
  {
    id: "ENG_ADV_A_OK",
    name: "פטור/סיווג מאנגלית מתקדמים א",
    credits: 0,
    type: "placement",
    notes: ["מיועד לסטודנטים שמתחילים מאנגלית מתקדמים ב או מעליה (ציון פסיכומטרי 100-119 ומעלה)."],
  },
  {
    id: "ENG_ADV_B_OK",
    name: "פטור/סיווג מאנגלית מתקדמים ב",
    credits: 0,
    type: "placement",
    satisfiesCourseId: "11059",
    notes: ["ציון פסיכומטרי 120-133 ומעלה. פטור מלא משרשרת האנגלית (למעט אנגלית טכנית) לציון 134 ומעלה."],
  },
  {
    id: "12179",
    name: "פטור מפיזיקה אקדמית",
    credits: 0,
    type: "placement",
    satisfiesCourseId: "11179",
    notes: ["ניתן פטור לבעלי ציון של 75 ומעלה בבחינת הבגרות בפיזיקה ברמת 5 יח\"ל."],
  },

  // ---------------------------------------------------------------------
  // Common - Semester 1 (identical for both tracks)
  // ---------------------------------------------------------------------
  {
    id: "11001",
    name: "אלגברה",
    credits: 4,
    type: "required",
    required: true,
    semester: 1,
  },
  {
    id: "11003",
    name: "חדו\"א 1",
    credits: 5,
    type: "required",
    required: true,
    semester: 1,
  },
  {
    id: "11063",
    name: "אנגלית בסיסי",
    credits: 0,
    type: "english",
    semester: 1,
    prerequisites: [],
    notes: ["לפי ציון פסיכומטרי באנגלית (85-99); אינו נספר בסיכום נ\"ז סמסטר 1."],
  },
  {
    id: "11064",
    name: "אנגלית מתקדמים א",
    credits: 0,
    type: "english",
    semester: 1,
    prerequisites: [any(["11063", "ENG_BASIC_OK"], "אנגלית בסיסית או פטור/סיווג")],
    notes: ["לפי ציון פסיכומטרי באנגלית (100-119); אינו נספר בסיכום נ\"ז סמסטר 1."],
  },
  {
    id: "11179",
    name: "מבוא לפיזיקה אקדמית",
    credits: 0,
    type: "required",
    required: true,
    semester: 1,
    notes: ["ניתן פטור לבעלי ציון 75+ בבגרות בפיזיקה 5 יח\"ל (ראו 12179); אינו נספר בסיכום נ\"ז סמסטר 1."],
  },
  {
    id: "51104",
    name: "מבוא להנדסת תעשייה",
    credits: 2,
    type: "required",
    required: true,
    semester: 1,
    notes: ["בחצי מהסמסטר יתקיימו הרצאות, ובחצי מהסמסטר יתקיימו הנחיות."],
  },
  {
    id: "61903",
    name: "מבוא למדעי המחשב לתעו\"נ",
    credits: 4,
    type: "required",
    required: true,
    semester: 1,
  },
  {
    id: "251961",
    name: "מיומנויות יסוד הנדסיות",
    credits: 1,
    type: "required",
    required: true,
    semester: 1,
    notes: ["חובה ללמוד בסמסטר 1 או 2."],
  },

  // ---------------------------------------------------------------------
  // Common - Semester 2
  // ---------------------------------------------------------------------
  {
    id: "11005",
    name: "חדו\"א 2",
    credits: 5,
    type: "required",
    required: true,
    semester: 2,
    prerequisites: [p(["11003"])],
    coRequisites: ["11001"],
  },
  {
    id: "11059",
    name: "אנגלית מתקדמים ב",
    credits: 2,
    type: "english",
    required: true,
    semester: 2,
    prerequisites: [any(["11064", "ENG_ADV_A_OK"], "אנגלית מתקדמים א או סיווג מתאים")],
  },
  {
    id: "11209",
    name: "פיזיקה IE1",
    credits: 3.5,
    type: "required",
    required: true,
    semester: 2,
    prerequisites: [any(["11179", "12179"], "מבוא לפיזיקה אקדמית או פטור"), p(["11003"])],
  },
  {
    id: "21127",
    name: "גרפיקה הנדסית לתעו\"נ",
    credits: 2,
    type: "required",
    required: true,
    semester: 2,
  },
  {
    id: "51005",
    name: "מתמטיקה דיסקרטית",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 2,
  },
  {
    id: "51021",
    name: "מבוא למדעי הנתונים",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 2,
    prerequisites: [p(["61903"])],
  },
  {
    id: "51600",
    name: "מבוא לכלכלה",
    credits: 4,
    type: "required",
    required: true,
    semester: 2,
    prerequisites: [p(["11003"])],
  },

  // ---------------------------------------------------------------------
  // Common - Semester 3
  // ---------------------------------------------------------------------
  {
    id: "11068",
    name: "אנגלית טכנית יישומית",
    credits: 1,
    type: "english",
    required: true,
    semester: 3,
    prerequisites: [any(["11059", "ENG_ADV_B_OK"], "אנגלית מתקדמים ב או פטור/סיווג")],
  },
  {
    id: "11210",
    name: "פיזיקה IE2",
    credits: 4,
    type: "required",
    required: true,
    semester: 3,
    prerequisites: [p(["11209"])],
    coRequisites: ["11005"],
  },
  {
    id: "51431",
    name: "מבוא למערכות ארגוניות",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 3,
    coRequisites: ["11064"],
  },
  {
    id: "51617",
    name: "חשבונאות פיננסית",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 3,
  },
  {
    id: "51702",
    name: "מודלים דטרמיניסטיים בחקב\"צ",
    credits: 3.5,
    type: "required",
    required: true,
    semester: 3,
    prerequisites: [p(["11001"])],
  },
  {
    id: "51709",
    name: "הסתברות",
    credits: 4,
    type: "required",
    required: true,
    semester: 3,
    prerequisites: [p(["51005", "11003"])],
  },

  // ---------------------------------------------------------------------
  // Track A - Semester 3
  // ---------------------------------------------------------------------
  {
    id: "61738",
    name: "מבנים אלגבריים להנדסת תוכנה",
    credits: 4,
    type: "required",
    requirementGroup: "track-a",
    semester: 3,
    prerequisites: [p(["11001"])],
  },

  // ---------------------------------------------------------------------
  // Track B - Semester 3
  // ---------------------------------------------------------------------
  {
    id: "21214",
    name: "תהליכי עיבוד לתעו\"נ",
    credits: 2,
    type: "required",
    requirementGroup: "track-b",
    semester: 3,
    prerequisites: [p(["21127"])],
    coRequisites: ["11209"],
  },
  {
    id: "51302",
    name: "מבוא לשיווק",
    credits: 2.5,
    type: "required",
    requirementGroup: "track-b",
    semester: 3,
    prerequisites: [p(["11059", "51600"])],
  },

  // ---------------------------------------------------------------------
  // Common - Semester 4
  // ---------------------------------------------------------------------
  {
    id: "51141",
    name: "מערכות ייצור משולבות מחשב (מיב\"מ)",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 4,
    prerequisites: [p(["11001", "21127", "61903"])],
  },
  {
    id: "51215",
    name: "תכן שיטות העבודה (חקר עבודה)",
    credits: 4,
    type: "required",
    required: true,
    semester: 4,
    prerequisites: [p(["51104"])],
    coRequisites: ["51723"],
  },
  {
    id: "51432",
    name: "תכן וניהול של מערכות ארגוניות",
    credits: 2.5,
    type: "required",
    required: true,
    semester: 4,
    prerequisites: [p(["51431"])],
  },
  {
    id: "51703",
    name: "מודלים סטוכסטיים בחקב\"צ",
    credits: 4,
    type: "required",
    required: true,
    semester: 4,
    prerequisites: [p(["11005", "51709"])],
  },
  {
    id: "51723",
    name: "סטטיסטיקה",
    credits: 4.5,
    type: "required",
    required: true,
    semester: 4,
    prerequisites: [p(["51709"])],
  },

  // ---------------------------------------------------------------------
  // Track A - Semester 4
  // ---------------------------------------------------------------------
  {
    id: "61745",
    name: "מבוא לתכנות מערכות",
    credits: 3,
    type: "required",
    requirementGroup: "track-a",
    semester: 4,
    prerequisites: [p(["61903", "51021"])],
  },

  // ---------------------------------------------------------------------
  // Track B - Semester 4
  // ---------------------------------------------------------------------
  {
    id: "51310",
    name: "משוואות דיפרנציאליות ומערכות בקרה",
    credits: 4.5,
    type: "required",
    requirementGroup: "track-b",
    semester: 4,
    prerequisites: [p(["11001", "11005"])],
    notes: [
      "מקור הנתונים מדגיש חוסר עקביות במקור: סיכום שעות המעבדה המודפס לסמסטר זה מציג \"1\", בעוד ששתי השורות 51215 ו-51723 תורמות שעת מעבדה אחת כל אחת (סה\"כ 2) - נשמר כאן ללא תיקון, לידיעת המתכנן.",
    ],
  },

  // ---------------------------------------------------------------------
  // Common - Semester 5
  // ---------------------------------------------------------------------
  {
    id: "51131",
    name: "ניהול מערכות ייצור",
    credits: 4,
    type: "required",
    required: true,
    semester: 5,
    prerequisites: [p(["11005", "51215", "51702", "51723"])],
  },
  {
    id: "51213",
    name: "ניהול איכות סטטיסטי",
    credits: 4,
    type: "required",
    required: true,
    semester: 5,
    prerequisites: [p(["51723"])],
  },
  {
    id: "51429",
    name: "אפיון וניתוח מערכות מידע",
    credits: 4,
    type: "required",
    required: true,
    semester: 5,
    prerequisites: [p(["51432"])],
  },
  {
    id: "51724",
    name: "סימולציה ספרתית",
    credits: 3,
    type: "required",
    required: true,
    semester: 5,
    prerequisites: [p(["51703", "61903"])],
    notes: [
      "המקור מציג יחס קדם/צמוד הפוך בין שני המסלולים (מסלול א': קדם 51703, צמוד 61903; מסלול ב': קדם 61903, צמוד 51703) - מאחר וקורס 61903 נלמד תמיד בסמסטר 1 (משותף), הוא תמיד יושלם קודם בפועל; מומדל כאן כשני קורסי קדם רגילים.",
    ],
  },

  // ---------------------------------------------------------------------
  // Track A - Semester 5
  // ---------------------------------------------------------------------
  {
    id: "61739",
    name: "מבני נתונים ומבוא לאלגוריתמים",
    credits: 4,
    type: "required",
    requirementGroup: "track-a",
    semester: 5,
    prerequisites: [p(["51005", "61745"])],
  },
  {
    id: "61778",
    name: "לוגיקה להנדסת תוכנה",
    credits: 3,
    type: "required",
    requirementGroup: "track-a",
    semester: 5,
    prerequisites: [p(["51005"])],
  },

  // ---------------------------------------------------------------------
  // Track B - Semester 5
  // ---------------------------------------------------------------------
  {
    id: "51013",
    name: "תכן הנדסי",
    credits: 2.5,
    type: "required",
    requirementGroup: "track-b",
    semester: 5,
    coRequisites: ["21214", "51302"],
  },
  {
    id: "51159",
    name: "מעבדה במיב\"מ (CIM)",
    credits: 1.5,
    type: "required",
    requirementGroup: "track-b",
    semester: 5,
    coRequisites: ["51141"],
  },
  {
    id: "51618",
    name: "חשבונאות ניהולית",
    credits: 2.5,
    type: "required",
    requirementGroup: "track-b",
    semester: 5,
    prerequisites: [p(["51617"])],
  },

  // ---------------------------------------------------------------------
  // Common - Semester 6
  // ---------------------------------------------------------------------
  {
    id: "51132",
    name: "תכנון ותפעול תהליך האספקה בארגון",
    credits: 4,
    type: "required",
    required: true,
    semester: 6,
    prerequisites: [p(["11005", "51215", "51702", "51723"])],
  },
  {
    id: "51519",
    name: "מסדי נתונים",
    credits: 3,
    type: "required",
    required: true,
    semester: 6,
    prerequisites: [p(["51429"])],
  },

  // ---------------------------------------------------------------------
  // Track A - Semester 6
  // (51430 has a track-dependent corequisite - modeled as a distinct row per
  // track vs. Track B's "51430-B" below, per the source's explicit divergence.)
  // ---------------------------------------------------------------------
  {
    id: "51022",
    name: "חקר סיבתיות בביצועים",
    credits: 3,
    type: "required",
    requirementGroup: "track-a",
    semester: 6,
    prerequisites: [p(["51723"])],
  },
  {
    id: "51430",
    name: "תכנון פרויקטים וניהולם",
    credits: 3,
    type: "required",
    requirementGroup: "track-a",
    semester: 6,
    prerequisites: [p(["51702", "51709"])],
    coRequisites: ["51955"],
    notes: ["גרסת מסלול א' (מדעי הנתונים); ראו גם 51430-B עבור מסלול ב', שם קורסי הקדם והצמוד שונים."],
  },
  {
    id: "51955",
    name: "חשבונאות ניהולית ומימון",
    credits: 2.5,
    type: "required",
    requirementGroup: "track-a",
    semester: 6,
    prerequisites: [p(["51617"])],
  },
  {
    id: "61753",
    name: "אלגוריתמים",
    credits: 5,
    type: "required",
    requirementGroup: "track-a",
    semester: 6,
    prerequisites: [p(["11005", "61738", "61739", "61778"])],
  },

  // ---------------------------------------------------------------------
  // Track B - Semester 6
  // ---------------------------------------------------------------------
  {
    id: "51138",
    name: "הנדסת אנוש",
    credits: 2,
    type: "required",
    requirementGroup: "track-b",
    semester: 6,
  },
  {
    id: "51430-B",
    name: "תכנון פרויקטים וניהולם",
    credits: 3,
    type: "required",
    requirementGroup: "track-b",
    semester: 6,
    prerequisites: [p(["51013", "51702", "51709"])],
    coRequisites: ["51608"],
    notes: ["גרסת מסלול ב' (תכן ותפעול) של קורס 51430; דרישות הקדם והצמוד שונות מגרסת מסלול א' (ראו 51430)."],
  },
  {
    id: "51525",
    name: "כריית נתונים",
    credits: 2.5,
    type: "required",
    requirementGroup: "track-b",
    semester: 6,
    prerequisites: [p(["51723", "61903"])],
  },
  {
    id: "51608",
    name: "ניהול פיננסי",
    credits: 2.5,
    type: "required",
    requirementGroup: "track-b",
    semester: 6,
    prerequisites: [p(["51600", "51617", "51709"])],
  },

  // ---------------------------------------------------------------------
  // Common - Semester 7
  // ---------------------------------------------------------------------
  {
    id: "51136",
    name: "תכן מערך העבודה",
    credits: 3,
    type: "required",
    required: true,
    semester: 7,
    prerequisites: [p(["51215", "51702"])],
    coRequisites: ["51724"],
  },

  // ---------------------------------------------------------------------
  // Track A - Semester 7 & 8 (final project sequence, fixed - no path choice)
  // ---------------------------------------------------------------------
  {
    id: "51023",
    name: "פרוייקט גמר בהתמחות מדעי הנתונים שלב א'",
    credits: 4,
    type: "required",
    requirementGroup: "track-a",
    semester: 7,
    prerequisites: [p(["51132"])],
    notes: [
      "מותנה בסיום כל קורסי החובה עד סוף סמסטר 5 ובמצב אקדמי תקין (ראה הערה 5 במסמך המקור).",
    ],
  },
  {
    id: "61761",
    name: "כריית נתונים ומערכות לומדות",
    credits: 4,
    type: "required",
    requirementGroup: "track-a",
    semester: 7,
    prerequisites: [p(["61753", "51709"])],
  },
  {
    id: "61775",
    name: "מבוא לבינה מלאכותית",
    credits: 2.5,
    type: "required",
    requirementGroup: "track-a",
    semester: 7,
    prerequisites: [p(["61753", "51709"])],
  },
  {
    id: "51024",
    name: "פרוייקט גמר בהתמחות מדעי הנתונים שלב ב'",
    credits: 4,
    type: "required",
    requirementGroup: "track-a",
    semester: 8,
    prerequisites: [p(["51023"])],
  },

  // ---------------------------------------------------------------------
  // Track B - Semester 7
  // ---------------------------------------------------------------------
  {
    id: "31323",
    name: "הנדסת חשמל לתעו\"נ",
    credits: 2,
    type: "required",
    requirementGroup: "track-b",
    semester: 7,
    prerequisites: [p(["11210"])],
  },

  // ---------------------------------------------------------------------
  // Track B - Practicum alternative (choose ONE path spanning semesters 7-8):
  // (a) industry placement 51014+51020 (10 credits total), or
  // (b) final project 51228+51229 (8 credits total).
  // See requirementGroups["track-b-practicum"] and the matching mutual-
  // exclusion rule below.
  // ---------------------------------------------------------------------
  {
    id: "51014",
    name: "התמחות בתעשייה שלב א'",
    credits: 5,
    type: "required",
    requirementGroup: "track-b-practicum",
    semester: 7,
    prerequisites: [p(["51132"])],
    notes: [
      "נתיב \"התמחות בתעשייה\" (10 נ\"ז כולל שלב ב'). מותנה בסיום כל קורסי החובה עד סוף סמסטר 5 ובמצב אקדמי תקין (ראה הערה 6 במסמך המקור). חלופה ל-51228 פרויקט גמר שלב א' - יש לבחור נתיב אחד בלבד.",
    ],
  },
  {
    id: "51020",
    name: "התמחות בתעשייה שלב ב'",
    credits: 5,
    type: "required",
    requirementGroup: "track-b-practicum",
    semester: 8,
    prerequisites: [p(["51014"])],
    notes: ["בהמשך לבחירה בשלב א' (ראה הערה 7 במסמך המקור)."],
  },
  {
    id: "51228",
    name: "פרויקט גמר שלב א'",
    credits: 4,
    type: "required",
    requirementGroup: "track-b-practicum",
    semester: 7,
    prerequisites: [p(["51132"])],
    notes: [
      "נתיב \"פרויקט גמר\" (8 נ\"ז כולל שלב ב'). מותנה בסיום כל קורסי החובה עד סוף סמסטר 5 ובמצב אקדמי תקין. חלופה ל-51014 התמחות בתעשייה שלב א' - יש לבחור נתיב אחד בלבד.",
    ],
  },
  {
    id: "51229",
    name: "פרויקט גמר שלב ב'",
    credits: 4,
    type: "required",
    requirementGroup: "track-b-practicum",
    semester: 8,
    prerequisites: [p(["51228"])],
    notes: ["בהמשך לבחירה בשלב א'."],
  },

  // ---------------------------------------------------------------------
  // Honors-student independent-study courses (both tracks, credits vary /
  // assigned by department head; see notes[] for the mutual-exclusion with
  // 11510/11511 מחקר במצוינות).
  // ---------------------------------------------------------------------
  {
    id: "51004",
    name: "נושא אישי",
    credits: 0,
    type: "elective",
    notes: [
      "לסטודנטים מצטיינים בלבד, בהנחיית חבר סגל של המחלקה; נ\"ז וקורס-בחירה משוייכים באישור ראש המחלקה. לא ניתן ללמוד במקביל ל-11510/11511 פרויקט מחקר במצוינות.",
    ],
  },
  {
    id: "51011",
    name: "נושא אישי",
    credits: 0,
    type: "elective",
    notes: [
      "לסטודנטים מצטיינים בלבד, בהנחיית חבר סגל של המחלקה; נ\"ז וקורס-בחירה משוייכים באישור ראש המחלקה. לא ניתן ללמוד במקביל ל-11510/11511 פרויקט מחקר במצוינות.",
    ],
  },

  // ---------------------------------------------------------------------
  // Shared cluster: אשכול מדע וטכנולוגיה (both tracks, choose 1)
  // ---------------------------------------------------------------------
  {
    id: "11198",
    name: "פיזיקה מודרנית",
    credits: 3,
    type: "elective",
    clusterId: "science-tech",
    prerequisites: [p(["11210"])],
  },
  {
    id: "11214",
    name: "תגליות מדעיות ששינו את החשיבה האנושית",
    credits: 2,
    type: "elective",
    clusterId: "science-tech",
    prerequisites: [p(["11210"])],
  },
  {
    id: "11215",
    name: "עקרונות מדעיים בשרות הטכנולוגיה",
    credits: 2,
    type: "elective",
    clusterId: "science-tech",
    coRequisites: ["11210"],
    notes: ["שורה זו מוצגת עם 11210 כצמוד (מודגש קו תחתי במקור) בשונה משורות שכנות (11198/11214) בהן אותו קורס מופיע כקדם רגיל."],
  },
  {
    id: "11216",
    name: "סימטריות בטבע",
    credits: 2,
    type: "elective",
    clusterId: "science-tech",
    prerequisites: [p(["11003"])],
  },
  {
    id: "11217",
    name: "נושאים נבחרים בפיזיקה",
    credits: 2,
    type: "elective",
    clusterId: "science-tech",
    prerequisites: [p(["11210", "11005", "51709"])],
  },
  {
    id: "22993",
    name: "תעשייה 4.0 (Industry)",
    credits: 3.5,
    type: "elective",
    clusterId: "science-tech",
  },
  {
    id: "41095",
    name: "כימיה כללית",
    credits: 2.5,
    type: "elective",
    clusterId: "science-tech",
  },
  {
    id: "41942",
    name: "מבוא לביולוגיה מולקולרית וגנטיקה",
    credits: 3,
    type: "elective",
    clusterId: "science-tech",
  },

  // ---------------------------------------------------------------------
  // Track A electives - courses exclusive to the Data Science elective list
  // (courses shared with Track B's clusters are tagged there, with a
  // cross-reference note here would duplicate IDs, so the cross-reference
  // note lives on the Track B row instead).
  // ---------------------------------------------------------------------
  {
    id: "61779",
    name: "סמינר בנושאים נבחרים בבינה מלאכותית",
    credits: 3,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["61761"])],
  },
  {
    id: "61933",
    name: "תורת המשחקים האלגוריתמית",
    credits: 3,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["61753", "51709"])],
  },
  {
    id: "61954",
    name: "למידה עמוקה יוצרת",
    credits: 3,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["61761"])],
  },
  {
    id: "61961",
    name: "אחזור מידע",
    credits: 2.5,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["61761"])],
  },
  {
    id: "61965",
    name: "ניתוח של נתוני הרשתות",
    credits: 2.5,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["61753"])],
  },
  {
    id: "61966",
    name: "סמינר מערכות לומדות",
    credits: 3,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["61761"])],
  },
  {
    id: "61984",
    name: "מעבדה באופטימיזציה",
    credits: 2.5,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["11005", "61745"])],
  },
  {
    id: "61987",
    name: "מעבדה בכריית נתונים",
    credits: 2.5,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["61761"])],
  },
  {
    id: "61991",
    name: "תכנות מדעי",
    credits: 3,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["61753", "51709"])],
  },
  {
    id: "61995",
    name: "אלגוריתמים לטקסטים ורצפים",
    credits: 2.5,
    type: "elective",
    clusterId: "data-science-electives",
    prerequisites: [p(["61753", "51709"])],
  },

  // ---------------------------------------------------------------------
  // Track B elective cluster: אשכול תכן ותפעול של מערכות ייצור ושירות
  // ---------------------------------------------------------------------
  {
    id: "51025",
    name: "היוריסטיקות על לבעיות אופטימיזציה",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51131", "51132"])],
    coRequisites: ["51136"],
  },
  {
    id: "51106",
    name: "מערכות מלאי",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51132", "51724"])],
  },
  {
    id: "51113",
    name: "אירועים בהנדסת תעשייה",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51131", "51132"])],
    coRequisites: ["51608"],
  },
  {
    id: "51120",
    name: "תורת השיבוץ",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51131"])],
  },
  {
    id: "51129",
    name: "מערכות שינוע ואחסנה",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51141"])],
    coRequisites: ["51136"],
  },
  {
    id: "51135",
    name: "גישות מתקדמות בהנדסת שיטות",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51215"])],
  },
  {
    id: "51144",
    name: "יישומי חקר ביצועים בעזרת מחשב",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51131", "51132", "51703", "51429", "51724"])],
  },
  {
    id: "51145",
    name: "ניהול והערכת סיכונים בפרויקטים הנדסיים",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["11001", "51723"])],
  },
  {
    id: "51154",
    name: "מבוא ל-ERP ומערכות ארגוניות",
    credits: 3,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [
      p(["51131", "51132"]),
      any(["51955", "51618"], "חשבונאות ניהולית ומימון (מסלול א') או חשבונאות ניהולית (מסלול ב')"),
    ],
    notes: ["מופיע במקור גם באשכול \"מערכות מידע ומדע הנתונים\" (רשומה כפולה במקור)."],
  },
  {
    id: "51156",
    name: "מבוא להנדסת מערכות שירות",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51703", "51724"])],
    notes: [
      "תא הנ\"ז במקור מודפס כ\"5\" ולא \"2.5\" (נבדק בהגדלה x16) - נראה כפגם הדפסה, שכן שורות אחרות עם אותו דפוס שעות (ה2/ת1/מ-) מציגות 2.5 נ\"ז; נבחר כאן הערך הסביר יותר (2.5).",
      "מופיע גם ברשימת הבחירה של מסלול א' (מדעי הנתונים) עם אותם קדם ונ\"ז.",
    ],
  },
  {
    id: "51160",
    name: "הנדסת מערכות ותעשייה 4.0",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51013"])],
    coRequisites: ["51430-B"],
  },
  {
    id: "51206",
    name: "הנדסת איכות",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51213"])],
  },
  {
    id: "51211",
    name: "כלים מתקדמים בהנדסת איכות",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51213"])],
  },
  {
    id: "51214",
    name: "כלכלת מיקום",
    credits: 2,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51600"])],
  },
  {
    id: "51614",
    name: "ניתוח כדאיות פרויקטים",
    credits: 2.5,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51723", "51608"])],
  },

  // ---------------------------------------------------------------------
  // Track B elective cluster: אשכול מערכות מידע ומדע הנתונים
  // (51154 already listed above under production-service-design - cross-listed per source)
  // ---------------------------------------------------------------------
  {
    id: "51026",
    name: "הצגת מידע חזותי וקוגניציה",
    credits: 2.5,
    type: "elective",
    clusterId: "info-systems-data-science",
    prerequisites: [p(["51429"])],
    notes: ["מופיע גם ברשימת הבחירה של מסלול א' (מדעי הנתונים)."],
  },
  {
    id: "51515",
    name: "פיתוח מנשקי אדם-מחשב",
    credits: 2.5,
    type: "elective",
    clusterId: "info-systems-data-science",
    prerequisites: [p(["51138"])],
  },
  {
    id: "51535",
    name: "למידה עמוקה",
    credits: 2.5,
    type: "elective",
    clusterId: "info-systems-data-science",
    prerequisites: [
      any(
        ["61761", "51525"],
        "כריית נתונים ומערכות לומדות (מסלול א') או כריית נתונים (מסלול ב')"
      ),
    ],
    notes: ["קורס קדם תלוי-מסלול: מסלול א' דורש 61761, מסלול ב' דורש 51525. מופיע גם ברשימת הבחירה של מסלול א'."],
  },
  {
    id: "51536",
    name: "ניתוח נתונים מושכל",
    credits: 2.5,
    type: "elective",
    clusterId: "info-systems-data-science",
    prerequisites: [p(["51723"])],
    notes: ["מופיע גם ברשימת הבחירה של מסלול א'."],
  },
  {
    id: "51537",
    name: "פיתוח תהליכים עסקיים",
    credits: 3,
    type: "elective",
    clusterId: "info-systems-data-science",
    prerequisites: [p(["51131", "51132", "51429"])],
    notes: ["מופיע גם ברשימת הבחירה של מסלול א'."],
  },
  {
    id: "51538",
    name: "כריית תהליכים",
    credits: 2.5,
    type: "elective",
    clusterId: "info-systems-data-science",
    prerequisites: [p(["61903", "51723"])],
    notes: [
      "רשימת מסלול א' מציינת קדם כפול (61903;51723); רשימת אשכול מסלול ב' מציינת רק 51723 - אוחד כאן לשני הקדמים לדיוק מרבי, מאחר ו-61903 משותף וסמסטר 1 בלבד.",
      "מופיע גם ברשימת הבחירה של מסלול א'.",
    ],
  },
  {
    id: "61831",
    name: "ניהול ידע",
    credits: 2.5,
    type: "elective",
    clusterId: "info-systems-data-science",
    prerequisites: [p(["51432", "51723"])],
    notes: ["מופיע גם ברשימת הבחירה של מסלול א'."],
  },
  {
    id: "61981",
    name: "הנדסת דרישות",
    credits: 2.5,
    type: "elective",
    clusterId: "info-systems-data-science",
    prerequisites: [p(["51429"])],
    notes: ["מופיע גם ברשימת הבחירה של מסלול א'."],
  },
  {
    id: "61986",
    name: "מעבדה בסחר אלקטרוני",
    credits: 2.5,
    type: "elective",
    clusterId: "info-systems-data-science",
    prerequisites: [p(["51429"])],
    notes: ["מופיע גם ברשימת הבחירה של מסלול א'."],
  },

  // ---------------------------------------------------------------------
  // Track B elective cluster: אשכול ניהול
  // ---------------------------------------------------------------------
  {
    id: "11211",
    name: "פעילות חברתית וקהילתית",
    credits: 2,
    type: "elective",
    clusterId: "management",
    notes: ["ניתן פטור בגין שירות מילואים."],
  },
  {
    id: "51227",
    name: "מסחר בינלאומי",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51600"])],
  },
  {
    id: "51300",
    name: "חקר שווקים תעשייתי",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51302"])],
  },
  {
    id: "51305",
    name: "שיווק בינלאומי",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51302"])],
  },
  {
    id: "51306",
    name: "אסטרטגיה שיווקית",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51302"])],
  },
  {
    id: "51307",
    name: "שיווק באינטרנט",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51302"])],
  },
  {
    id: "51312",
    name: "כלכלת עסקים",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51600"])],
  },
  {
    id: "51419",
    name: "ניהול חוצה תרבויות",
    credits: 2.5,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51432"])],
  },
  {
    id: "51422",
    name: "סוגיות נבחרות במדעי ההתנהגות",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51432"])],
  },
  {
    id: "51610",
    name: "ניתוח דו\"חות כספיים ושוק ההון",
    credits: 2.5,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51617"])],
  },
  {
    id: "51612",
    name: "סוגיות נבחרות בתמחיר ובקרה",
    credits: 2.5,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51618"])],
  },
  {
    id: "51733",
    name: "יישומים כלכליים ועסקיים באמצעות משחקים",
    credits: 2.5,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51600", "51702"])],
  },
  {
    id: "61957",
    name: "תורת המשחקים",
    credits: 2.5,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["11001", "51709"])],
    notes: ["מופיע גם ברשימת הבחירה של מסלול א' (מדעי הנתונים) עם אותם קדם ונ\"ז."],
  },

  // ---------------------------------------------------------------------
  // Entrepreneurship-center electives (up to 3 credits countable toward
  // electives; each tagged to the cluster listed in the source's last column).
  // ---------------------------------------------------------------------
  {
    id: "251100",
    name: "פרויקט רב-תחומי",
    credits: 3,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["31323", "51430-B"])],
    notes: ["עד 3 נ\"ז ממסלול קורסי המרכז לחינוך הנדסי וליזמות ניתן לזקוף לזכות קורסי הבחירה."],
  },
  {
    id: "251104",
    name: "מבוא ליזמות מורחב",
    credits: 2,
    type: "elective",
    clusterId: "management",
    notes: ["קורס מקביל ל-251504 - ניתן לקחת רק אחד משני הקורסים."],
  },
  {
    id: "251504",
    name: "הנדסת יזמות - גישת ההזנק הרזה",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51302", "51617"])],
    notes: ["קורס מקביל ל-251104 - ניתן לקחת רק אחד משני הקורסים."],
  },
  {
    id: "251506",
    name: "מבוא לקניין רוחני",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51617"])],
  },
  {
    id: "251508",
    name: "תכנון עסקי למיזמי הזנק",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51302", "51600"])],
  },
  {
    id: "251509",
    name: "חשיבה המצאתית",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51013"])],
    notes: ["קורס מקביל ל-251513 - ניתן לקחת רק אחד משני הקורסים."],
  },
  {
    id: "251512",
    name: "מבוא לניהול חדשנות ויזמות פנים ארגונית",
    credits: 2,
    type: "elective",
    clusterId: "management",
    prerequisites: [p(["51431"])],
    coRequisites: ["51432"],
  },
  {
    id: "251513",
    name: "חשיבה יצירתית שיטתית",
    credits: 2,
    type: "elective",
    clusterId: "management",
    notes: ["קורס מקביל ל-251509 - ניתן לקחת רק אחד משני הקורסים."],
  },
  {
    id: "251514",
    name: "מבוא לפיתוח אב טיפוס",
    credits: 2,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51013", "61903"])],
    notes: ["קורס מקביל ל-251965 - ניתן לקחת רק אחד משני הקורסים."],
  },
  {
    id: "251895",
    name: "תעשייה 4.0 בשילוב התנסות",
    credits: 3,
    type: "elective",
    clusterId: "production-service-design",
    prerequisites: [p(["51159", "51131"])],
  },
  {
    id: "251965",
    name: "מהנדסים לגיל השלישי",
    credits: 2,
    type: "elective",
    clusterId: "production-service-design",
    coRequisites: ["51013"],
    notes: ["קורס מקביל ל-251514 - ניתן לקחת רק אחד משני הקורסים."],
  },
  {
    id: "251966",
    name: "מוצר וחשיבה עיצובית",
    credits: 2.5,
    type: "elective",
    clusterId: "info-systems-data-science",
    coRequisites: ["51515"],
  },
  ...generalStudiesCourses,
  ...sportCourses,
];

export const degreePlan: DegreePlan = {
  id: "industrial-engineering-bsc",
  title: "מפת תואר הנדסת תעשייה וניהול",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ד (מסלולי מדעי הנתונים ותכן ותפעול)",
  source: {
    fileName: "ידיעונים, שנתונים ולוח שנה אקדמית - בראודה.pdf",
    pages: "160-175",
    extractedAt: "2026-07-10",
  },
  requirements: {
    // Track A (מדעי הנתונים) is used as the structural baseline here because it has a single,
    // fully-determined mandatory sequence (no industry-placement/final-project choice and no
    // cluster-minimum electives beyond a flat "choose 4-5"). Track B's fixed/elective split
    // differs: common+track-b mandatory = ~125 credits + practicum (8 or 10 credits, path-
    // dependent) + at least 7-8 electives constrained by per-cluster minimums (see clusters
    // above and the track-b-practicum requirementGroup / rules below). Both tracks converge
    // on the same 160 נ"ז graduation floor.
    totalCredits: 160,
    fixedDegreeCredits: 136.5,
    electiveCreditsNeeded: 23.5,
    generalCredits: 6,
    sportCredits: 1,
    englishRequiredIds: ["11059", "11068"],
  },
  courseTypes: [
    { code: "required", label: "חובה", sortOrder: 0 },
    { code: "elective", label: "בחירה", sortOrder: 1 },
    { code: "general", label: "כללי", sortOrder: 2 },
    { code: "sport", label: "ספורט", sortOrder: 3 },
    { code: "english", label: "אנגלית", sortOrder: 4 },
    { code: "placement", label: "סיווג/פטור", sortOrder: 5 },
  ],
  requirementGroups: [
    {
      code: "track-a",
      name: "מסלול מדעי הנתונים - קורסי חובה ייחודיים",
      kind: "track",
      requiredCredits: 42,
      minCourses: 12,
      courseIds: [
        "61738",
        "61745",
        "61739",
        "61778",
        "51022",
        "51430",
        "51955",
        "61753",
        "51023",
        "61761",
        "61775",
        "51024",
      ],
    },
    {
      code: "track-b",
      name: "מסלול תכן ותפעול של מערכות ייצור ושירות - קורסי חובה ייחודיים",
      kind: "track",
      requiredCredits: 27.5,
      minCourses: 11,
      courseIds: [
        "21214",
        "51302",
        "51310",
        "51013",
        "51159",
        "51618",
        "51138",
        "51430-B",
        "51525",
        "51608",
        "31323",
      ],
    },
    {
      code: "track-b-practicum",
      name: "מסלול ב' - התנסות מעשית (התמחות בתעשייה או פרויקט גמר)",
      kind: "alternative",
      requiredCredits: 8,
      minCourses: 2,
      courseIds: ["51014", "51020", "51228", "51229"],
      metadata: {
        note: "יש לבחור נתיב אחד: 51014+51020 (התמחות בתעשייה, 10 נ\"ז) או 51228+51229 (פרויקט גמר, 8 נ\"ז).",
      },
    },
    {
      code: "general-studies",
      name: "לימודים כלליים",
      kind: "credits",
      requiredCredits: 6,
    },
    {
      code: "sport-elective",
      name: "ספורט",
      kind: "credits",
      requiredCredits: 1,
    },
  ],
  clusters,
  courses,
  rules: [
    {
      id: "track-selection-mutual-exclusion",
      type: "track_selection",
      message:
        "יש לבחור מסלול התמחות אחד עד סוף שנה א' (מדעי הנתונים או תכן ותפעול של מערכות ייצור ושירות); קורסי החובה הייחודיים של המסלול שלא נבחר אינם רלוונטיים לתואר.",
      payload: {
        trackACourseIds: [
          "61738",
          "61745",
          "61739",
          "61778",
          "51022",
          "51430",
          "51955",
          "61753",
          "51023",
          "61761",
          "61775",
          "51024",
        ],
        trackBCourseIds: [
          "21214",
          "51302",
          "51310",
          "51013",
          "51159",
          "51618",
          "51138",
          "51430-B",
          "51525",
          "51608",
          "31323",
        ],
      },
      enabled: true,
    },
    {
      id: "track-b-practicum-path-mutual-exclusion",
      type: "mutual_exclusion",
      message:
        "מסלול ב': יש לבחור נתיב התנסות מעשית אחד בלבד - התמחות בתעשייה (51014+51020) או פרויקט גמר (51228+51229), לא שילוב של השניים.",
      payload: { courseIds: ["51014", "51020", "51228", "51229"], maxSelected: 2 },
      enabled: true,
    },
    {
      id: "entrepreneurship-invention-thinking-mutual-exclusion",
      type: "mutual_exclusion",
      message: "ניתן לקחת רק אחד מבין 251509 חשיבה המצאתית ו-251513 חשיבה יצירתית שיטתית.",
      payload: { courseIds: ["251509", "251513"], maxSelected: 1 },
      enabled: true,
    },
    {
      id: "entrepreneurship-prototype-seniors-mutual-exclusion",
      type: "mutual_exclusion",
      message: "ניתן לקחת רק אחד מבין 251514 מבוא לפיתוח אב טיפוס ו-251965 מהנדסים לגיל השלישי.",
      payload: { courseIds: ["251514", "251965"], maxSelected: 1 },
      enabled: true,
    },
    {
      id: "entrepreneurship-intro-leanstartup-mutual-exclusion",
      type: "mutual_exclusion",
      message: "ניתן לקחת רק אחד מבין 251104 מבוא ליזמות מורחב ו-251504 הנדסת יזמות - גישת ההזנק הרזה.",
      payload: { courseIds: ["251104", "251504"], maxSelected: 1 },
      enabled: true,
    },
    {
      id: "honors-personal-topic-mutual-exclusion",
      type: "mutual_exclusion",
      message: "לא ניתן ללמוד במקביל קורסים 51004/51011 נושא אישי, וקורסים 11510/11511 פרויקט מחקר במצוינות.",
      payload: { courseIds: ["51004", "51011"], maxSelected: 1 },
      enabled: true,
    },
    {
      id: "physics-exemption-mutual-exclusion",
      type: "mutual_exclusion",
      message: "לא ניתן לסמן גם 11179 מבוא לפיזיקה אקדמית וגם 12179 פטור מפיזיקה אקדמית.",
      payload: { courseIds: ["11179", "12179"], maxSelected: 1 },
      enabled: true,
    },
    {
      id: "english-basic-placement-mutual-exclusion",
      type: "mutual_exclusion",
      message: "לא ניתן לסמן גם אנגלית בסיסי וגם פטור/סיווג מאנגלית בסיסית.",
      payload: { courseIds: ["11063", "ENG_BASIC_OK"], maxSelected: 1 },
      enabled: true,
    },
    {
      id: "english-advanced-a-placement-mutual-exclusion",
      type: "mutual_exclusion",
      message: "לא ניתן לסמן גם אנגלית מתקדמים א וגם פטור/סיווג מאנגלית מתקדמים א.",
      payload: { courseIds: ["11064", "ENG_ADV_A_OK"], maxSelected: 1 },
      enabled: true,
    },
    {
      id: "english-advanced-b-placement-mutual-exclusion",
      type: "mutual_exclusion",
      message: "לא ניתן לסמן גם אנגלית מתקדמים ב וגם פטור/סיווג מאנגלית מתקדמים ב.",
      payload: { courseIds: ["11059", "ENG_ADV_B_OK"], maxSelected: 1 },
      enabled: true,
    },
    {
      id: "english-exemptions-single-choice",
      type: "mutual_exclusion",
      message: "ניתן לבחור פטור/סיווג אנגלית אחד בלבד: בסיסי, מתקדמים א או מתקדמים ב.",
      payload: { courseIds: ["ENG_BASIC_OK", "ENG_ADV_A_OK", "ENG_ADV_B_OK"], maxSelected: 1 },
      enabled: true,
    },
  ],
  notes: [
    "לצורך זכאות לתואר יש לצבור לפחות 160 נ\"ז.",
    "יש לבחור מסלול התמחות (מדעי הנתונים, או תכן ותפעול של מערכות ייצור ושירות) עד סוף שנה א' לכל המאוחר.",
    "כל תוכנית לימודים כוללת גם: 3 קורסים ממאגר הלימודים הכלליים (ניתן לפזר לאורך התואר), קורס אחד מאשכול מדע וטכנולוגיה המשותף, קורס ספורט אחד, ורכיב התנסות מעשית/פרויקט גמר בן 2 סמסטרים.",
    "יש ללמוד שני קורסי אנגלית לפחות, לפחות אחד מהם קורס תוכן; חובה לסיים את כל קורסי האנגלית עד סוף סמסטר 4.",
    "מסלול מדעי הנתונים: קורסי הבחירה הם רשימה שטוחה של כ-21 קורסים - יש לבחור 4-5 מהם (בהתאם לנ\"ז שנצברות).",
    "מסלול תכן ותפעול: הבחירה מובנית סביב שני נתיבי התנסות מעשית (התמחות בתעשייה או פרויקט גמר), עם מינימום קורסים מכל אחד משלושת אשכולות הבחירה (תכן ותפעול, ניהול, מערכות מידע ומדע הנתונים) - ראו הערות האשכולות לעיל.",
    "לא ניתן להחשיב קורס ששייך לשני אשכולות ביותר מאשכול אחד אחד (גם אם הוא מופיע ברשימת יותר מאשכול אחד במקור, כפי שמצוין בהערות הקורסים).",
    "עד 3 נ\"ז מקורסי המרכז לחינוך הנדסי וליזמות ניתן לזקוף לזכות קורסי הבחירה.",
    "סטודנטים מצטיינים המעוניינים בהתנסות מחקרית יכולים לקחת קורס/י 'נושא אישי' (51004/51011) בהנחיית חבר סגל ובאישור ראש המחלקה; לא ניתן ללמוד במקביל אליהם את 11510/11511 פרויקט מחקר במצוינות.",
    "ניתן לקחת קורסי בחירה על פי תוכנית אישית, מותנה באישור מיוחד של ראש המחלקה.",
    "אנומליה בנתוני המקור (סמסטר 4, מסלול ב'): סיכום שעות המעבדה המודפס מציג \"1\" בעוד ששורות 51215+51723 מסתכמות בפועל ל-2 שעות מעבדה - נשמר כפי שהוא במקור, ללא תיקון.",
    "אנומליה בנתוני המקור: תא הנ\"ז של קורס 51156 מודפס כ\"5\" ולא \"2.5\"; נבחר כאן 2.5 כערך הסביר יותר (עקבי עם שאר הקורסים בעלי אותו דפוס שעות).",
    "requirements.fixedDegreeCredits/electiveCreditsNeeded לעיל מחושבים לפי מסלול א' (מדעי הנתונים) כבסיס מבני, מאחר שהמבנה של מסלול ב' תלוי-נתיב (התמחות/פרויקט) ואינו ניתן לייצוג כמספר יחיד; ראו הערה בקוד המקור ליד השדה.",
    "המסמך הרשמי עשוי להשתנות; המחשבון הוא כלי עזר לתכנון ולא אישור זכאות רשמי.",
  ],
};
