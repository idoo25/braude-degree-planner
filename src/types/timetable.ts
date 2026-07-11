import type { Course } from "@/types/degree";

export type TimetableMeeting = {
  dayOfWeek: string | null;
  dayIndex: number | null;
  startTime: string | null;
  endTime: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  room: string | null;
  lecturerName: string | null;
};

export type SectionRequirementLink = {
  requiredCourseCode: string | null;
  requiredSectionType: string | null;
  requiredSectionId: number | null;
  resolutionStatus: "resolved" | "unresolved";
};

export type OfferingSection = {
  id: number;
  key: string;
  semesterPeriod: string | null;
  sectionType: string;
  groupCode: string | null;
  groupNumber: string | null;
  lecturerName: string | null;
  affiliationNote: string | null;
  isFull: boolean;
  isBlockedForRegistration: boolean;
  scheduleStatus: "scheduled" | "time-unpublished" | "no-meetings";
  hasDetails: boolean;
  meetings: TimetableMeeting[];
  requiredSections: SectionRequirementLink[];
};

export type ExamSlot = {
  semesterPeriod: string | null;
  examDate: string;
  examTime: string | null;
  termLabels: string[];
  lecturerNames: string[];
  sourceKinds: string[];
};

export type ProgramCourseOffering = {
  course: Course;
  offered: boolean;
  schedulable: boolean;
  yedionCourseName: string | null;
  sections: OfferingSection[];
  examSlots: ExamSlot[];
};

export type TimetableBundle = {
  courseId: string;
  courseName: string;
  sections: OfferingSection[];
};

export type SectionSelections = Record<string, Record<string, number[]>>;

export type TimetablePreference = {
  strategy: "no-overlaps" | "least-overlap";
  minimumFreeDays: number;
  prioritizeFreeDays: boolean;
  preferredFreeDayIndices: number[];
};

export type GeneratedTimetable = {
  bundles: TimetableBundle[];
  meetingCount: number;
  overlapMinutes: number;
  overlappingCourseCount: number;
  freeDayCount: number;
};

export type CourseAdditionSuggestion = {
  addedCourseIds: string[];
  addedCourseNames: string[];
  addedDayCount: number;
  schedule: GeneratedTimetable;
};

export type AdditionCourseType = "general" | "elective" | "sport";
