import "server-only";

import { getDegreePlan, getProgramList } from "@/lib/db/degree-repository";
import { getDb } from "@/lib/db/sqlite";
import type { Course, DegreePlan } from "@/types/degree";
import type {
  OfferingSection,
  ProgramCourseOffering,
  SectionRequirementLink,
  TimetableMeeting,
} from "@/types/timetable";

type Row = Record<string, unknown>;

export type OfferingOptions = {
  semester?: string | null;
  courseIds?: string[];
};

export const FREE_TIMETABLE_PROGRAM_ID = "free-timetable";

export function getFreeTimetablePlan(): DegreePlan {
  const coursesById = new Map<string, Course>();

  for (const program of getProgramList()) {
    for (const course of getDegreePlan(program.id).courses) {
      if (coursesById.has(course.id)) continue;
      coursesById.set(course.id, {
        id: course.id,
        name: course.name,
        credits: course.credits,
        type: "elective",
      });
    }
  }

  return {
    id: FREE_TIMETABLE_PROGRAM_ID,
    title: "מערכת שעות חופשית",
    subtitle: "בחירת קורסים ללא מפת תואר או בדיקת דרישות קדם",
    source: {
      fileName: "yedion catalog",
      pages: "",
      extractedAt: "",
    },
    requirements: {
      totalCredits: 0,
      fixedDegreeCredits: 0,
      electiveCreditsNeeded: 0,
      generalCredits: 0,
      sportCredits: 0,
      englishRequiredIds: [],
    },
    courseTypes: [],
    requirementGroups: [],
    clusters: [],
    courses: [...coursesById.values()].sort((left, right) => left.name.localeCompare(right.name, "he")),
    rules: [],
    notes: [],
  };
}

function normalizeSemester(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (text === "1") return "א";
  if (text === "2") return "ב";
  if (text === "3") return "קיץ";
  return text || null;
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function splitDelimited(value: unknown) {
  return typeof value === "string" && value.trim()
    ? [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]
    : [];
}

const DAYS = new Map<string, { index: number; label: string }>([
  ["א", { index: 1, label: "יום ראשון" }],
  ["יום ראשון", { index: 1, label: "יום ראשון" }],
  ["ב", { index: 2, label: "יום שני" }],
  ["יום שני", { index: 2, label: "יום שני" }],
  ["ג", { index: 3, label: "יום שלישי" }],
  ["יום שלישי", { index: 3, label: "יום שלישי" }],
  ["ד", { index: 4, label: "יום רביעי" }],
  ["יום רביעי", { index: 4, label: "יום רביעי" }],
  ["ה", { index: 5, label: "יום חמישי" }],
  ["יום חמישי", { index: 5, label: "יום חמישי" }],
  ["ו", { index: 6, label: "יום שישי" }],
  ["יום שישי", { index: 6, label: "יום שישי" }],
]);

function normalizeDayOfWeek(value: string | null) {
  const rawValue = value?.trim() ?? "";
  return DAYS.get(rawValue)?.label ?? text(value);
}

function dayIndex(value: string | null) {
  return DAYS.get(value?.trim() ?? "")?.index ?? null;
}

function timeToMinutes(value: string | null) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function joinDistinctValues(...values: Array<string | null>) {
  const distinctValues = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return distinctValues.length ? distinctValues.join(" / ") : null;
}

function mergeSectionMeetings(meetings: TimetableMeeting[]) {
  const merged = new Map<string, TimetableMeeting>();

  for (const meeting of meetings) {
    const key = [
      meeting.dayIndex ?? "",
      meeting.dayOfWeek ?? "",
      meeting.startTime ?? "",
      meeting.endTime ?? "",
    ].join("\u0000");
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...meeting });
      continue;
    }

    existing.room = joinDistinctValues(existing.room, meeting.room);
    existing.lecturerName = joinDistinctValues(existing.lecturerName, meeting.lecturerName);
  }

  return [...merged.values()].sort(
    (left, right) =>
      (left.dayIndex ?? Number.MAX_SAFE_INTEGER) - (right.dayIndex ?? Number.MAX_SAFE_INTEGER) ||
      (left.startMinutes ?? Number.MAX_SAFE_INTEGER) - (right.startMinutes ?? Number.MAX_SAFE_INTEGER) ||
      (left.endMinutes ?? Number.MAX_SAFE_INTEGER) - (right.endMinutes ?? Number.MAX_SAFE_INTEGER)
  );
}

function sectionRowToSection(row: Row): OfferingSection {
  return {
    id: Number(row.section_id),
    key: String(row.section_key),
    semesterPeriod: text(row.semester_period),
    sectionType: String(row.section_type),
    groupCode: text(row.group_code),
    groupNumber: text(row.group_number),
    lecturerName: text(row.lecturer_name),
    affiliationNote: text(row.note_text),
    isFull: Number(row.is_full) === 1,
    isBlockedForRegistration: Number(row.is_blocked_for_registration) === 1,
    scheduleStatus: String(row.schedule_status) as OfferingSection["scheduleStatus"],
    hasDetails: Number(row.has_details) === 1,
    meetings: [],
    requiredSections: [],
  };
}

export function getProgramCourseOfferings(
  programId: string | undefined,
  { semester = null, courseIds = [] }: OfferingOptions = {}
): ProgramCourseOffering[] {
  const plan = getDegreePlan(programId);
  const resolvedProgramId = plan.id;
  const selectedIds = new Set(courseIds.map(String));
  const planCourses = courseIds.length
    ? plan.courses.filter((course) => selectedIds.has(course.id))
    : plan.courses;
  const byCourseId = new Map<string, ProgramCourseOffering>(
    planCourses.map((course): [string, ProgramCourseOffering] => [
      course.id,
      {
        course,
        offered: false,
        schedulable: false,
        yedionCourseName: null,
        sections: [],
        examSlots: [],
      },
    ])
  );
  const semesterPeriod = normalizeSemester(semester);
  const db = getDb();
  const filters = ["plan_course.program_id = ?"];
  const parameters: unknown[] = [resolvedProgramId];

  if (semesterPeriod) {
    filters.push("section.semester_period = ?");
    parameters.push(semesterPeriod);
  }
  if (courseIds.length) {
    filters.push(`plan_course.id IN (${courseIds.map(() => "?").join(", ")})`);
    parameters.push(...courseIds);
  }

  const sectionRows = db
    .prepare(
      `
        SELECT
          plan_course.id AS plan_course_id,
          yedion_course.name AS yedion_course_name,
          section.id AS section_id,
          section.section_key,
          section.semester_period,
          section.section_type,
          section.group_code,
          section.group_number,
          section.lecturer_name,
          section.note_text,
          section.is_full,
          section.is_blocked_for_registration,
          quality.schedule_status,
          quality.has_details
        FROM courses plan_course
        LEFT JOIN yedion_code_aliases alias ON alias.course_id = plan_course.id
        JOIN yedion_course_sections section
          ON section.course_code = COALESCE(alias.yedion_course_code, plan_course.id)
        JOIN yedion_courses yedion_course ON yedion_course.course_code = section.course_code
        JOIN yedion_section_schedule_quality quality ON quality.section_id = section.id
        WHERE ${filters.join(" AND ")}
        ORDER BY plan_course.id, section.section_type, section.group_code, section.group_number
      `
    )
    .all(...parameters) as Row[];

  const sectionsById = new Map<number, OfferingSection>();
  for (const row of sectionRows) {
    const offering = byCourseId.get(String(row.plan_course_id));
    if (!offering) continue;

    const section = sectionRowToSection(row);
    offering.offered = true;
    offering.schedulable ||= section.scheduleStatus === "scheduled";
    offering.yedionCourseName = text(row.yedion_course_name);
    offering.sections.push(section);
    sectionsById.set(section.id, section);
  }

  if (!sectionsById.size) {
    return Array.from(byCourseId.values());
  }

  const meetingRows = db
    .prepare(
      `
        SELECT m.section_id, m.day_of_week, m.start_time, m.end_time, m.room,
          COALESCE(m.lecturer_name, section.lecturer_name) AS lecturer_name
        FROM courses plan_course
        LEFT JOIN yedion_code_aliases alias ON alias.course_id = plan_course.id
        JOIN yedion_course_sections section
          ON section.course_code = COALESCE(alias.yedion_course_code, plan_course.id)
        JOIN yedion_section_meetings m ON m.section_id = section.id
        WHERE plan_course.program_id = ?
          ${semesterPeriod ? "AND section.semester_period = ?" : ""}
      `
    )
    .all(...[resolvedProgramId, ...(semesterPeriod ? [semesterPeriod] : [])]) as Row[];

  for (const row of meetingRows) {
    const section = sectionsById.get(Number(row.section_id));
    if (!section) continue;

    const startTime = text(row.start_time);
    const endTime = text(row.end_time);
    const dayOfWeek = normalizeDayOfWeek(text(row.day_of_week));
    const meeting: TimetableMeeting = {
      dayOfWeek,
      dayIndex: dayIndex(dayOfWeek),
      startTime,
      endTime,
      startMinutes: timeToMinutes(startTime),
      endMinutes: timeToMinutes(endTime),
      room: text(row.room),
      lecturerName: text(row.lecturer_name),
    };
    section.meetings.push(meeting);
  }

  for (const section of sectionsById.values()) {
    section.meetings = mergeSectionMeetings(section.meetings);
  }

  const linkRows = db
    .prepare(
      `
        SELECT resolution.source_section_id, resolution.required_course_code,
          resolution.required_section_type, resolution.required_section_id,
          resolution.resolution_status
        FROM courses plan_course
        LEFT JOIN yedion_code_aliases alias ON alias.course_id = plan_course.id
        JOIN yedion_course_sections section
          ON section.course_code = COALESCE(alias.yedion_course_code, plan_course.id)
        JOIN yedion_section_link_resolution resolution ON resolution.source_section_id = section.id
        WHERE plan_course.program_id = ?
          ${semesterPeriod ? "AND section.semester_period = ?" : ""}
      `
    )
    .all(...[resolvedProgramId, ...(semesterPeriod ? [semesterPeriod] : [])]) as Row[];

  for (const row of linkRows) {
    const section = sectionsById.get(Number(row.source_section_id));
    if (!section) continue;

    const link: SectionRequirementLink = {
      requiredCourseCode: text(row.required_course_code),
      requiredSectionType: text(row.required_section_type),
      requiredSectionId: toNumber(row.required_section_id),
      resolutionStatus: row.resolution_status === "resolved" ? "resolved" : "unresolved",
    };
    section.requiredSections.push(link);
  }

  const examRows = db
    .prepare(
      `
        SELECT
          plan_course.id AS plan_course_id,
          slot.semester_period,
          slot.exam_date,
          slot.exam_time,
          slot.term_labels,
          slot.lecturer_names,
          slot.source_kinds
        FROM courses plan_course
        LEFT JOIN yedion_code_aliases alias ON alias.course_id = plan_course.id
        JOIN yedion_exam_slots slot
          ON slot.course_code = COALESCE(alias.yedion_course_code, plan_course.id)
        WHERE plan_course.program_id = ?
          ${semesterPeriod ? "AND slot.semester_period = ?" : ""}
        ORDER BY plan_course.id, slot.exam_date, slot.exam_time
      `
    )
    .all(...[resolvedProgramId, ...(semesterPeriod ? [semesterPeriod] : [])]) as Row[];

  for (const row of examRows) {
    const offering = byCourseId.get(String(row.plan_course_id));
    if (!offering) continue;
    offering.examSlots.push({
      semesterPeriod: text(row.semester_period),
      examDate: String(row.exam_date),
      examTime: text(row.exam_time),
      termLabels: splitDelimited(row.term_labels),
      lecturerNames: splitDelimited(row.lecturer_names),
      sourceKinds: splitDelimited(row.source_kinds),
    });
  }

  return Array.from(byCourseId.values());
}

export function getFreeTimetableOfferings({ semester = null, courseIds = [] }: OfferingOptions = {}): ProgramCourseOffering[] {
  const plan = getFreeTimetablePlan();
  const selectedCourseIds = new Set(courseIds.map(String));
  const allowedCourses = courseIds.length
    ? plan.courses.filter((course) => selectedCourseIds.has(course.id))
    : plan.courses;
  const allowedCourseIds = new Set(allowedCourses.map((course) => course.id));
  const offeringByCourseId = new Map<string, ProgramCourseOffering>();

  for (const program of getProgramList()) {
    for (const offering of getProgramCourseOfferings(program.id, { semester, courseIds })) {
      if (!allowedCourseIds.has(offering.course.id)) continue;

      const current = offeringByCourseId.get(offering.course.id);
      if (!current || offering.sections.length > current.sections.length) {
        offeringByCourseId.set(offering.course.id, offering);
      }
    }
  }

  return allowedCourses.map((course) => {
    const offering = offeringByCourseId.get(course.id);
    return offering
      ? { ...offering, course }
      : { course, offered: false, schedulable: false, yedionCourseName: null, sections: [], examSlots: [] };
  });
}
