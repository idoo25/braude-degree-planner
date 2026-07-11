"use client";

import {
  AlertTriangle,
  Anchor,
  ArrowUp,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  ListFilter,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { createDegreeAudit } from "@/lib/degree-audit";
import { generateTimetables, suggestCourseAdditions } from "@/lib/timetable-generator";
import { cn } from "@/lib/utils";
import type { Course, CourseAudit, DegreePlan } from "@/types/degree";
import type {
  AdditionCourseType,
  CourseAdditionSuggestion,
  ExamSlot,
  GeneratedTimetable,
  OfferingSection,
  ProgramCourseOffering,
  SectionSelections,
  TimetableBundle,
  TimetableMeeting,
  TimetablePreference,
} from "@/types/timetable";

const STORAGE_NAMESPACE = "degree-planner:selected";
const MAX_SELECTED_COURSES = 12;
const MAX_OFFERINGS_CACHE_ENTRIES = 8;
const offeringsCache = new Map<string, ProgramCourseOffering[]>();
const ENGLISH_START_LEVELS = [
  { value: "basic", label: "בסיסי", placementId: null },
  { value: "advanced-a", label: "מתקדמים א", placementId: "ENG_BASIC_OK" },
  { value: "advanced-b", label: "מתקדמים ב", placementId: "ENG_ADV_A_OK" },
  { value: "exempt", label: "פטור מלא", placementId: "ENG_ADV_B_OK" },
] as const;
const WEEK_DAYS = [
  { index: 1, label: "א׳" },
  { index: 2, label: "ב׳" },
  { index: 3, label: "ג׳" },
  { index: 4, label: "ד׳" },
  { index: 5, label: "ה׳" },
  { index: 6, label: "ו׳" },
] as const;
// Six drafting-ink identities (see globals.css .course-ink-N): each course keeps
// one ink across the parts list and the weekly grid, so color carries identity.
const COURSE_INK_COUNT = 6;
const BRAUDE_TIME_SLOTS = [
  { start: 8 * 60 + 30, teachingEnd: 9 * 60 + 20 },
  { start: 9 * 60 + 30, teachingEnd: 10 * 60 + 20 },
  { start: 10 * 60 + 30, teachingEnd: 11 * 60 + 20 },
  { start: 11 * 60 + 30, teachingEnd: 12 * 60 + 20 },
  { start: 12 * 60 + 50, teachingEnd: 13 * 60 + 40 },
  { start: 13 * 60 + 50, teachingEnd: 14 * 60 + 40 },
  { start: 14 * 60 + 50, teachingEnd: 15 * 60 + 40 },
  { start: 15 * 60 + 50, teachingEnd: 16 * 60 + 40 },
  { start: 16 * 60 + 50, teachingEnd: 17 * 60 + 40 },
  { start: 17 * 60 + 50, teachingEnd: 18 * 60 + 40 },
  { start: 18 * 60 + 50, teachingEnd: 19 * 60 + 40 },
  { start: 19 * 60 + 50, teachingEnd: 20 * 60 + 40 },
  { start: 20 * 60 + 50, teachingEnd: 21 * 60 + 40 },
  { start: 21 * 60 + 50, teachingEnd: 22 * 60 + 40 },
] as const;
const BRAUDE_BREAKS = BRAUDE_TIME_SLOTS.map((slot, index) => {
  const nextStart = BRAUDE_TIME_SLOTS[index + 1]?.start ?? slot.teachingEnd + 10;

  return {
    start: slot.teachingEnd,
    end: nextStart,
    label: nextStart - slot.teachingEnd === 30 ? "הפסקת צהריים" : "הפסקה",
  };
});
const BRAUDE_GRID_END = 22 * 60 + 50;
const ADDITION_COURSE_TYPE_OPTIONS: { value: AdditionCourseType; label: string }[] = [
  { value: "general", label: "כללי" },
  { value: "elective", label: "בחירה" },
  { value: "sport", label: "ספורט" },
];

type EnglishStartLevel = (typeof ENGLISH_START_LEVELS)[number]["value"];
type SelectionMode = "map" | "manual";
type AlternativeOverlapTab = "no-overlaps" | "with-overlaps";
type TimetableProgramOption = {
  id: string;
  title: string;
  catalogYear?: string | null;
  status?: "active" | "archived";
};

const TIMETABLE_PREFERENCE: TimetablePreference = {
  strategy: "no-overlaps",
  minimumFreeDays: 0,
  prioritizeFreeDays: false,
  preferredFreeDayIndices: [],
};

type GeneratorResponse = {
  requestedCourseIds: string[];
  blockedCourseIds: string[];
  notOfferedCourseIds: string[];
  coursesWithoutBundles: string[];
  schedules: GeneratedTimetable[];
  error?: string;
};

type ScheduleMeetingEntry = {
  courseId: string;
  courseName: string;
  section: OfferingSection;
  meeting: TimetableMeeting;
};

type PositionedScheduleMeetingEntry = ScheduleMeetingEntry & {
  columnIndex: number;
  columnCount: number;
};

type PersistedTimetableState = {
  semester?: string;
  degreeSemester?: string;
  selectionMode?: SelectionMode;
  courseQuery?: string;
  activeCourseType?: string;
  activeElectiveCluster?: string;
  selectedCourseIds?: string[];
  sectionSelections?: SectionSelections;
  anchorSelections?: SectionSelections;
  generated?: GeneratorResponse | null;
  activeScheduleIndex?: number;
  showAnchorsHelp?: boolean;
  showScheduleOptionsHelp?: boolean;
  interactiveSchedule?: GeneratedTimetable | null;
  interactiveCourseId?: string | null;
  editingCourseIds?: string[];
  additionCourseTypes?: AdditionCourseType[];
  onlyExistingDays?: boolean;
  preferredFreeDayIndices?: number[];
  suggestions?: CourseAdditionSuggestion[];
  alternativeOverlapTab?: AlternativeOverlapTab;
  alternativeFreeDayCount?: number | null;
  showProgramSelectionPrompt?: boolean;
};

function readCompletedCourses(storageKey: string) {
  try {
    const value = window.localStorage.getItem(storageKey);
    const parsed = value ? (JSON.parse(value) as { selectedCourseIds?: unknown }) : null;
    return Array.isArray(parsed?.selectedCourseIds)
      ? parsed.selectedCourseIds.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function readTimetableState(storageKey: string): PersistedTimetableState | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return null;

    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as PersistedTimetableState
      : null;
  } catch {
    return null;
  }
}

function sameCourseIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((courseId, index) => courseId === right[index]);
}

function scheduleIncludesCourseIds(schedule: GeneratedTimetable, courseIds: string[]) {
  const selectedCourseIds = new Set(schedule.bundles.map((bundle) => bundle.courseId));
  return courseIds.every((courseId) => selectedCourseIds.has(courseId));
}

function formatClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatCredits(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function formatExamDate(examDate: string) {
  const parsedDate = new Date(`${examDate}T12:00:00`);
  if (Number.isNaN(parsedDate.valueOf())) return examDate;

  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsedDate);
}

function canonicalCourseName(offering: ProgramCourseOffering) {
  return offering.yedionCourseName ?? offering.course.name;
}

function isAcademicHebrewCourse(course: Course) {
  const normalizedName = normalizedCourseName(course.name);

  return (
    course.id === "11360" ||
    course.id === "11361" ||
    normalizedName.includes("עברית אקדמית") ||
    normalizedName.includes("עברית למטרות אקדמיות")
  );
}

function englishCourseLevel(course: Course) {
  if (course.type !== "english") return null;
  if (course.name.includes("בסיס")) return 0;
  if (course.name.includes("מתקדמים א")) return 1;
  if (course.name.includes("מתקדמים ב")) return 2;
  return null;
}

function sectionSelectionsForSchedule(schedule: GeneratedTimetable): SectionSelections {
  const selections: SectionSelections = {};

  for (const bundle of schedule.bundles) {
    const bySectionType = selections[bundle.courseId] ?? {};
    for (const section of bundle.sections) {
      bySectionType[section.sectionType] = [...new Set([...(bySectionType[section.sectionType] ?? []), section.id])];
    }
    selections[bundle.courseId] = bySectionType;
  }

  return selections;
}

function withSectionSelection(
  selections: SectionSelections,
  courseId: string,
  sectionType: string,
  sectionIds: number[] | undefined
): SectionSelections {
  const courseSelections = { ...(selections[courseId] ?? {}) };

  if (sectionIds) courseSelections[sectionType] = sectionIds;
  else delete courseSelections[sectionType];

  const nextSelections = { ...selections };
  if (Object.keys(courseSelections).length) nextSelections[courseId] = courseSelections;
  else delete nextSelections[courseId];
  return nextSelections;
}

function withScheduleSectionType(
  schedule: GeneratedTimetable,
  offering: ProgramCourseOffering,
  sectionType: string,
  sectionIds: number[]
): GeneratedTimetable {
  const selectedSections = offering.sections.filter(
    (section) => section.sectionType === sectionType && sectionIds.includes(section.id)
  );
  let foundBundle = false;
  const bundles = schedule.bundles.map((bundle) => {
    if (bundle.courseId !== offering.course.id) return bundle;
    foundBundle = true;

    return {
      ...bundle,
      sections: [
        ...bundle.sections.filter((section) => section.sectionType !== sectionType),
        ...selectedSections,
      ],
    };
  });

  if (!foundBundle && selectedSections.length) {
    bundles.push({
      courseId: offering.course.id,
      courseName: canonicalCourseName(offering),
      sections: selectedSections,
    });
  }

  return createInteractiveSchedule(bundles);
}

function normalizedCourseName(value: string) {
  return value
    .replace(/[׳'"״]/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedSearchText(value: string) {
  return normalizedCourseName(value).toLocaleLowerCase("he");
}

function readCachedOfferings(cacheKey: string) {
  const cached = offeringsCache.get(cacheKey);
  if (!cached) return null;

  // Keep recently used semesters around while putting a firm ceiling on the
  // in-browser catalog cache. Free mode can be close to a megabyte per semester.
  offeringsCache.delete(cacheKey);
  offeringsCache.set(cacheKey, cached);
  return cached;
}

function cacheOfferings(cacheKey: string, offerings: ProgramCourseOffering[]) {
  offeringsCache.delete(cacheKey);
  offeringsCache.set(cacheKey, offerings);

  if (offeringsCache.size > MAX_OFFERINGS_CACHE_ENTRIES) {
    const oldestKey = offeringsCache.keys().next().value;
    if (oldestKey) offeringsCache.delete(oldestKey);
  }
}

function getBraudeGridStart(earliestStart: number) {
  const nextSlotIndex = BRAUDE_TIME_SLOTS.findIndex((slot) => slot.start >= earliestStart);

  if (nextSlotIndex === -1) return BRAUDE_TIME_SLOTS[BRAUDE_TIME_SLOTS.length - 1].start;

  return BRAUDE_TIME_SLOTS[Math.max(0, nextSlotIndex - 1)].start;
}

function getBraudeGridEnd(latestEnd: number) {
  const nextSlotIndex = BRAUDE_TIME_SLOTS.findIndex((slot) => slot.start >= latestEnd);

  if (nextSlotIndex === -1) return BRAUDE_GRID_END;

  const endSlotIndex = BRAUDE_TIME_SLOTS[nextSlotIndex].start === latestEnd ? nextSlotIndex + 1 : nextSlotIndex;
  return BRAUDE_TIME_SLOTS[Math.min(endSlotIndex, BRAUDE_TIME_SLOTS.length - 1)].start;
}

function formatMeeting(meeting: TimetableMeeting) {
  const day = meeting.dayOfWeek || "יום טרם פורסם";
  const time = meeting.startTime && meeting.endTime ? `${meeting.startTime}-${meeting.endTime}` : "שעה טרם פורסמה";
  const room = meeting.room
    ? ` | ${meeting.room.includes(" / ") ? `חדרים: ${meeting.room}` : meeting.room}`
    : "";
  return `${day} | ${time}${room}`;
}

function groupLabel(section: OfferingSection) {
  return section.groupNumber || section.groupCode || "ללא מספר";
}

function sectionCanBeScheduled(section: OfferingSection) {
  return (
    section.scheduleStatus === "scheduled" &&
    section.meetings.length > 0 &&
    !section.isBlockedForRegistration
  );
}

function selectableSectionIds(offering: ProgramCourseOffering, sectionType: string) {
  return offering.sections
    .filter((section) => section.sectionType === sectionType && sectionCanBeScheduled(section))
    .map((section) => section.id);
}

function courseInk(courseId: string) {
  const hash = Array.from(courseId).reduce((total, character) => total + character.charCodeAt(0), 0);
  return `course-ink-${hash % COURSE_INK_COUNT}`;
}

function SectionPicker({
  offering,
  selections,
  anchorSelections,
  showCurrentSelection,
  disabled,
  interactive,
  onToggleSection,
  onToggleAnchor,
  onResetSectionType,
}: {
  offering: ProgramCourseOffering;
  selections: Record<string, number[]> | undefined;
  anchorSelections: Record<string, number[]> | undefined;
  showCurrentSelection: boolean;
  disabled: boolean;
  interactive?: boolean;
  onToggleSection: (sectionType: string, sectionId: number, checked: boolean) => void;
  onToggleAnchor: (sectionType: string, sectionId: number, checked: boolean) => void;
  onResetSectionType: (sectionType: string) => void;
}) {
  const groupsByType = useMemo(() => {
    const byType = new Map<string, OfferingSection[]>();
    for (const section of offering.sections) {
      if (section.scheduleStatus !== "scheduled" || !section.meetings.length) continue;
      const sections = byType.get(section.sectionType) ?? [];
      sections.push(section);
      byType.set(section.sectionType, sections);
    }

    return Array.from(byType.entries())
      .sort(([left], [right]) => left.localeCompare(right, "he"))
      .map(([sectionType, sections]) => [
        sectionType,
        [...sections].sort((left, right) => groupLabel(left).localeCompare(groupLabel(right), "he")),
      ] as const);
  }, [offering.sections]);

  return (
    <div className="border-t bg-muted/25 px-4 py-4" dir="rtl">
      <div className="space-y-5">
        {groupsByType.map(([sectionType, sections]) => {
          const manuallyConstrained = Object.prototype.hasOwnProperty.call(selections ?? {}, sectionType);
          const selectedIds = manuallyConstrained
            ? selections?.[sectionType] ?? []
            : sections.filter(sectionCanBeScheduled).map((section) => section.id);
          const manuallyAnchored = Object.prototype.hasOwnProperty.call(anchorSelections ?? {}, sectionType);
          const anchoredIds = manuallyAnchored
            ? anchorSelections?.[sectionType] ?? []
            : selectableSectionIds(offering, sectionType);

          return (
            <section key={sectionType} className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">{sectionType}</h4>
                  <Badge variant="secondary">
                    {manuallyConstrained ? `${selectedIds.length} נבחרו` : "כל הקבוצות"}
                  </Badge>
                </div>
                {manuallyConstrained ? (
                  <Button type="button" variant="link" size="xs" onClick={() => onResetSectionType(sectionType)}>
                    {interactive ? "הסרת כל הקבוצות" : "כל הקבוצות"}
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {sections.map((section) => {
                  const selectable = sectionCanBeScheduled(section);
                  const sectionId = `${offering.course.id}:${section.sectionType}:${section.id}`;
                  const selectedForCurrentSchedule = selectedIds.includes(section.id);
                  const anchoredForCalculation = anchoredIds.includes(section.id);

                  return (
                    <div
                      key={section.id}
                      className={cn(
                        "min-w-0 overflow-hidden border border-border/80 bg-background",
                        !selectable && "bg-muted/40 opacity-65"
                      )}
                    >
                      <button
                        type="button"
                        disabled={disabled || !selectable}
                        aria-pressed={anchoredForCalculation}
                        onClick={() => onToggleAnchor(sectionType, section.id, !anchoredForCalculation)}
                        className={cn(
                          "flex w-full items-center gap-2 border-b px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                          anchoredForCalculation
                            ? "border-warning/40 bg-warning/15 text-warning"
                            : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Anchor className="size-3.5" aria-hidden="true" />
                        <span>{anchoredForCalculation ? "עוגן לחישוב" : "לא עוגן לחישוב"}</span>
                      </button>
                      <Checkbox
                        id={sectionId}
                        checked={selectedForCurrentSchedule}
                        disabled={disabled || !selectable || !showCurrentSelection}
                        aria-label={`בחירת ${sectionType} ${groupLabel(section)}`}
                        className="sr-only"
                        onCheckedChange={(next) => onToggleSection(sectionType, section.id, next === true)}
                      />
                      <label
                        htmlFor={sectionId}
                        className={cn(
                          "min-w-0 flex-1 space-y-1.5 text-right",
                          showCurrentSelection ? "cursor-pointer" : "cursor-default"
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{groupLabel(section)}</span>
                          {section.isFull ? <Badge variant="destructive">מלאה</Badge> : null}
                          {section.isBlockedForRegistration ? <Badge variant="destructive">חסומה</Badge> : null}
                          {section.affiliationNote ? <Badge variant="outline">שיוך: {section.affiliationNote}</Badge> : null}
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {section.meetings.map(formatMeeting).join(" · ")}
                        </p>
                        {section.lecturerName ? <p className="text-xs text-muted-foreground">{section.lecturerName}</p> : null}
                      </label>
                      {showCurrentSelection ? (
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={selectedForCurrentSchedule}
                          disabled={disabled || !selectable}
                          onClick={() => onToggleSection(sectionType, section.id, !selectedForCurrentSchedule)}
                          className={cn(
                            "flex w-full items-center gap-2 border-t px-3 py-1.5 text-right text-xs font-medium transition-colors disabled:cursor-not-allowed",
                            selectedForCurrentSchedule
                              ? "border-success/25 bg-success/10 text-success"
                              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "grid size-4 place-items-center rounded-[4px] border",
                              selectedForCurrentSchedule ? "border-success bg-success text-success-foreground" : "border-input bg-background"
                            )}
                          >
                            {selectedForCurrentSchedule ? <CheckCircle2 className="size-3" /> : null}
                          </span>
                          <strong className="font-semibold">{sectionType}</strong>
                          <span>{selectedForCurrentSchedule ? "נבחר למערכת הנוכחית" : "לא נבחר למערכת הנוכחית"}</span>
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CourseAvailabilityRow({
  offering,
  audit,
  selected,
  selectionLocked,
  manualSelection,
  onToggle,
}: {
  offering: ProgramCourseOffering;
  audit: CourseAudit | undefined;
  selected: boolean;
  selectionLocked: boolean;
  manualSelection: boolean;
  onToggle: (courseId: string, checked: boolean) => void;
}) {
  const legal = Boolean(audit?.available && !audit.completed);
  const canSelectCourse = !audit?.completed && (manualSelection || legal);
  const selectable = canSelectCourse && offering.schedulable && !selectionLocked;
  const hasUnpublishedGroups = offering.sections.some((section) => section.scheduleStatus !== "scheduled");
  const courseName = canonicalCourseName(offering);
  const planNameDiffers =
    offering.yedionCourseName &&
    normalizedCourseName(offering.yedionCourseName) !== normalizedCourseName(offering.course.name);

  return (
    <div className={cn("border-b last:border-b-0", selected && "bg-primary/5", !canSelectCourse && "opacity-60")}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3">
        <Checkbox
          checked={selected}
          disabled={!selected && !selectable}
          aria-label={`בחירת ${courseName}`}
          className="mt-1"
          onCheckedChange={(checked) => onToggle(offering.course.id, checked === true)}
        />
        <div className="min-w-0 space-y-1.5 text-right" dir="rtl">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium leading-6">{courseName}</h3>
            <span className="font-mono text-xs text-muted-foreground">{offering.course.id}</span>
          </div>
          {planNameDiffers ? <p className="text-xs text-muted-foreground">בתוכנית: {offering.course.name}</p> : null}
          <div className="flex flex-wrap gap-1.5">
            {audit?.completed ? <Badge variant="secondary">הושלם</Badge> : null}
            {!audit?.completed && audit?.available ? <Badge className="bg-success/10 text-success">חוקי</Badge> : null}
            {!audit?.available && !audit?.completed ? (
              <Badge variant={manualSelection ? "outline" : "destructive"}>
                {manualSelection ? "קדם חסר" : "חסום"}
              </Badge>
            ) : null}
            <Badge variant="outline">{offering.sections.filter((section) => section.scheduleStatus === "scheduled").length} קבוצות</Badge>
            {hasUnpublishedGroups ? <Badge variant="outline">זמן חלקי</Badge> : null}
            {offering.examSlots.length ? <Badge variant="outline">{offering.examSlots.length} מועדי בחינה</Badge> : null}
          </div>
          {!audit?.available && !audit?.completed && audit?.missingPrerequisites.length ? (
            <p className="text-xs leading-5 text-destructive">
              חסר: {audit.missingPrerequisites.map((item) => item.label).join("; ")}
            </p>
          ) : null}
        </div>
        <div className="pt-1 font-mono text-sm text-muted-foreground">{offering.course.credits} נק״ז</div>
      </div>
    </div>
  );
}

function scheduleMeetings(schedule: GeneratedTimetable): ScheduleMeetingEntry[] {
  return schedule.bundles.flatMap((bundle) =>
    bundle.sections.flatMap((section) =>
      section.meetings.map((meeting) => ({
        courseId: bundle.courseId,
        courseName: bundle.courseName,
        section,
        meeting,
      }))
    )
  );
}

function layoutDayMeetings(entries: ScheduleMeetingEntry[]): PositionedScheduleMeetingEntry[] {
  const sortedEntries = [...entries].sort(
    (left, right) =>
      (left.meeting.startMinutes ?? 0) - (right.meeting.startMinutes ?? 0) ||
      (left.meeting.endMinutes ?? 0) - (right.meeting.endMinutes ?? 0)
  );
  const positioned: PositionedScheduleMeetingEntry[] = [];
  let cluster: ScheduleMeetingEntry[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  function placeCluster() {
    if (!cluster.length) return;

    const laneEndTimes: number[] = [];
    const placements = cluster.map((entry) => {
      const start = entry.meeting.startMinutes ?? 0;
      const end = entry.meeting.endMinutes ?? start;
      const reusableLane = laneEndTimes.findIndex((laneEnd) => laneEnd <= start);
      const columnIndex = reusableLane === -1 ? laneEndTimes.length : reusableLane;

      laneEndTimes[columnIndex] = end;
      return { entry, columnIndex };
    });

    for (const placement of placements) {
      positioned.push({
        ...placement.entry,
        columnIndex: placement.columnIndex,
        columnCount: laneEndTimes.length,
      });
    }
  }

  for (const entry of sortedEntries) {
    const start = entry.meeting.startMinutes ?? 0;
    const end = entry.meeting.endMinutes ?? start;

    if (cluster.length && start >= clusterEnd) {
      placeCluster();
      cluster = [];
      clusterEnd = Number.NEGATIVE_INFINITY;
    }

    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, end);
  }

  placeCluster();
  return positioned;
}

function meetingOverlapMinutes(left: TimetableMeeting, right: TimetableMeeting) {
  if (
    left.dayIndex === null ||
    left.dayIndex !== right.dayIndex ||
    left.startMinutes === null ||
    left.endMinutes === null ||
    right.startMinutes === null ||
    right.endMinutes === null
  ) {
    return 0;
  }

  return Math.max(0, Math.min(left.endMinutes, right.endMinutes) - Math.max(left.startMinutes, right.startMinutes));
}

function createInteractiveSchedule(bundles: TimetableBundle[]): GeneratedTimetable {
  const entries = bundles.flatMap((bundle) =>
    bundle.sections.flatMap((section) => section.meetings.map((meeting) => ({ courseId: bundle.courseId, meeting })))
  );
  const overlappingCourseIds = new Set<string>();
  let overlapMinutes = 0;

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      if (left.courseId === right.courseId) continue;

      const overlap = meetingOverlapMinutes(left.meeting, right.meeting);
      if (!overlap) continue;

      overlapMinutes += overlap;
      overlappingCourseIds.add(left.courseId);
      overlappingCourseIds.add(right.courseId);
    }
  }

  const usedDays = new Set(
    entries
      .map((entry) => entry.meeting.dayIndex)
      .filter((dayIndex): dayIndex is number => dayIndex !== null && dayIndex >= 1 && dayIndex <= 6)
  );

  return {
    bundles,
    meetingCount: entries.length,
    overlapMinutes,
    overlappingCourseCount: overlappingCourseIds.size,
    freeDayCount: 6 - usedDays.size,
  };
}

function ScheduleGrid({
  schedule,
  onSelectCourse,
}: {
  schedule: GeneratedTimetable;
  onSelectCourse?: (courseId: string) => void;
}) {
  const entries = scheduleMeetings(schedule).filter(
    (entry) =>
      entry.meeting.dayIndex !== null &&
      entry.meeting.dayIndex >= 1 &&
      entry.meeting.dayIndex <= 6 &&
      entry.meeting.startMinutes !== null &&
      entry.meeting.endMinutes !== null
  );
  const usedDays = WEEK_DAYS.filter((day) => entries.some((entry) => entry.meeting.dayIndex === day.index));
  const days = usedDays.length ? usedDays : WEEK_DAYS.slice(0, 5);
  const earliestStart = entries.length ? Math.min(...entries.map((entry) => entry.meeting.startMinutes ?? 480)) : 480;
  const latestEnd = entries.length ? Math.max(...entries.map((entry) => entry.meeting.endMinutes ?? 1020)) : 1020;
  const startMinutes = getBraudeGridStart(earliestStart);
  const endMinutes = Math.max(startMinutes + 60, getBraudeGridEnd(latestEnd));
  const timelinePoints = [...new Set([
    startMinutes,
    endMinutes,
    ...BRAUDE_TIME_SLOTS.flatMap((slot) => [slot.start, slot.teachingEnd]).filter(
      (minute) => minute >= startMinutes && minute <= endMinutes
    ),
    ...entries.flatMap((entry) => [entry.meeting.startMinutes ?? startMinutes, entry.meeting.endMinutes ?? endMinutes]),
  ])].sort((left, right) => left - right);
  const rowHeights = timelinePoints.slice(0, -1).map((start, index) => {
    const end = timelinePoints[index + 1];
    const isBreak = BRAUDE_BREAKS.some((breakPeriod) => breakPeriod.start === start && breakPeriod.end === end);

    return isBreak ? 10 : Math.max(16, Math.round((end - start) * 0.35));
  });
  const pointIndex = new Map(timelinePoints.map((minute, index) => [minute, index]));

  // Every time row grows only as much as its most detailed lesson needs.
  // This keeps lecturer, time, and room visible without making every lesson a fixed pixel height.
  for (const entry of entries) {
    const start = entry.meeting.startMinutes ?? startMinutes;
    const end = entry.meeting.endMinutes ?? start;
    const startIndex = pointIndex.get(start);
    const endIndex = pointIndex.get(end);
    if (startIndex === undefined || endIndex === undefined || endIndex <= startIndex) continue;

    const lecturer = entry.meeting.lecturerName ?? entry.section.lecturerName;
    const visibleLineCount = 3 + (lecturer ? 1 : 0) + (entry.meeting.room ? 1 : 0);
    const minimumContentHeight = 24 + visibleLineCount * 12;
    const currentHeight = rowHeights.slice(startIndex, endIndex).reduce((total, rowHeight) => total + rowHeight, 0);
    const extraHeight = Math.max(0, minimumContentHeight - currentHeight);
    if (!extraHeight) continue;

    const teachingRows = Array.from({ length: endIndex - startIndex }, (_, index) => startIndex + index).filter(
      (index) => !BRAUDE_BREAKS.some(
        (breakPeriod) => breakPeriod.start === timelinePoints[index] && breakPeriod.end === timelinePoints[index + 1]
      )
    );
    const targetRows = teachingRows.length ? teachingRows : Array.from({ length: endIndex - startIndex }, (_, index) => startIndex + index);

    targetRows.forEach((index, rowIndex) => {
      rowHeights[index] += Math.floor(extraHeight / targetRows.length) + (rowIndex < extraHeight % targetRows.length ? 1 : 0);
    });
  }

  const pointTop = new Map<number, number>();
  let height = 0;
  timelinePoints.forEach((minute, index) => {
    pointTop.set(minute, height);
    height += rowHeights[index] ?? 0;
  });
  const positionForMinute = (minute: number) => pointTop.get(minute) ?? 0;
  height = Math.max(120, height);
  const visibleSlots = BRAUDE_TIME_SLOTS.filter((slot) => slot.start >= startMinutes && slot.start <= endMinutes);
  const visibleBreaks = BRAUDE_BREAKS.filter((breakPeriod) => breakPeriod.start < endMinutes && breakPeriod.end > startMinutes);

  return (
    <div className="overflow-x-auto pb-2" dir="rtl">
      <div
        className="grid min-w-[700px] border border-border"
        style={{ gridTemplateColumns: `3.75rem repeat(${days.length}, minmax(9rem, 1fr))` }}
      >
        <div className="border-b-2 border-foreground/15 bg-muted/45 px-1 py-2 text-center font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          שעה
        </div>
        {days.map((day) => (
          <div key={day.index} className="border-b-2 border-s border-foreground/15 bg-muted/45 px-2 py-2 text-center text-sm font-semibold">
            יום {day.label}
          </div>
        ))}
        <div className="relative border-e bg-muted/20" style={{ height }}>
          {visibleSlots.map((slot) => (
            <span
              key={slot.start}
              className="absolute left-1.5 -translate-y-1/2 font-mono text-[0.68rem] text-muted-foreground"
              style={{ top: positionForMinute(slot.start) }}
            >
              {formatClock(slot.start)}
            </span>
          ))}
          {visibleBreaks
            .filter((breakPeriod) => breakPeriod.label === "הפסקת צהריים")
            .map((breakPeriod) => (
              <span
                key={breakPeriod.start}
                className="absolute left-1 right-1 -translate-y-1/2 text-center text-[0.58rem] leading-3 text-muted-foreground"
                style={{ top: positionForMinute(breakPeriod.start) + (positionForMinute(breakPeriod.end) - positionForMinute(breakPeriod.start)) / 2 }}
              >
                הפסקה
              </span>
            ))}
        </div>
        {days.map((day) => {
          const dayEntries = layoutDayMeetings(entries.filter((entry) => entry.meeting.dayIndex === day.index));

          return (
            <div key={day.index} className="relative border-s" style={{ height }}>
              {visibleBreaks.map((breakPeriod) => (
                <div
                  key={`break-${breakPeriod.start}`}
                  className="pointer-events-none absolute inset-x-0 border-y border-dashed border-border/70 bg-muted/45"
                  style={{
                    top: positionForMinute(breakPeriod.start),
                    height: positionForMinute(breakPeriod.end) - positionForMinute(breakPeriod.start),
                  }}
                  title={breakPeriod.label}
                />
              ))}
              {visibleSlots.map((slot) => (
                <div
                  key={slot.start}
                  className="pointer-events-none absolute inset-x-0 border-t border-border/70"
                  style={{ top: positionForMinute(slot.start) }}
                />
              ))}
              {dayEntries.map((entry, index) => {
                const start = entry.meeting.startMinutes ?? startMinutes;
                const end = entry.meeting.endMinutes ?? start + 30;
                const group = `${entry.section.sectionType} ${groupLabel(entry.section)}`;
                const lecturer = entry.meeting.lecturerName ?? entry.section.lecturerName;

                return (
                  <button
                    type="button"
                    key={`${entry.courseId}:${entry.section.id}:${index}`}
                    className={cn(
                      "absolute z-10 min-w-0 overflow-hidden border border-(--course-accent)/30 border-s-[3px] border-s-(--course-accent) bg-(--course-surface) px-1.5 py-1 text-right text-[0.6rem] leading-3 text-(--course-ink) shadow-sm transition-shadow disabled:cursor-default",
                      onSelectCourse && "hover:ring-2 hover:ring-(--course-accent)/45",
                      courseInk(entry.courseId)
                    )}
                    style={{
                      top: positionForMinute(start) + 1,
                      height: Math.max(18, positionForMinute(end) - positionForMinute(start) - 2),
                      insetInlineStart: `calc(${(entry.columnIndex / entry.columnCount) * 100}% + 0.25rem)`,
                      width: `calc(${100 / entry.columnCount}% - 0.5rem)`,
                    }}
                    title={`${entry.courseName} | ${group} | ${formatMeeting(entry.meeting)}`}
                    disabled={!onSelectCourse}
                  onClick={() => onSelectCourse?.(entry.courseId)}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className="shrink-0 bg-(--course-accent) px-1 py-px text-[0.55rem] font-bold leading-3 text-(--card)">
                        {entry.section.sectionType}
                      </span>
                      <span className="truncate font-mono text-[0.55rem] opacity-75">{groupLabel(entry.section)}</span>
                    </div>
                    <div className="truncate font-semibold">{entry.courseName}</div>
                    {lecturer ? <div className="truncate opacity-85">{lecturer}</div> : null}
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="truncate font-mono">{entry.meeting.startTime}-{entry.meeting.endTime}</span>
                      {entry.meeting.room ? <span className="truncate opacity-85">{entry.meeting.room}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SchedulePreview({
  schedule,
  onSelectCourse,
}: {
  schedule: GeneratedTimetable;
  onSelectCourse?: (courseId: string) => void;
}) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  return (
    <div className="space-y-5" dir="rtl">
      <ScheduleGrid schedule={schedule} onSelectCourse={onSelectCourse} />
      <section className="border-t pt-4">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-right"
          aria-expanded={detailsExpanded}
          onClick={() => setDetailsExpanded((current) => !current)}
        >
          <span className="text-sm font-medium">פירוט הקבוצות במערכת</span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", detailsExpanded && "rotate-180")} />
        </button>
        {detailsExpanded ? (
          <div className="mt-4 grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
            {schedule.bundles.map((bundle) => (
              <section key={bundle.courseId} className="border-s-2 border-primary/40 ps-3">
                <h3 className="text-sm font-medium">{bundle.courseName}</h3>
                <div className="mt-1.5 space-y-1 text-xs leading-5 text-muted-foreground">
                  {bundle.sections.map((section) => (
                    <p key={section.id}>
                      <span className="font-medium text-foreground">{section.sectionType} {groupLabel(section)}</span>
                      {section.lecturerName ? ` · ${section.lecturerName}` : ""}
                      {": "}{section.meetings.map(formatMeeting).join(" · ")}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ScheduleExamDates({
  schedule,
  offerings,
}: {
  schedule: GeneratedTimetable;
  offerings: ProgramCourseOffering[];
}) {
  const [examsExpanded, setExamsExpanded] = useState(false);
  const offeringByCourseId = new Map(offerings.map((offering) => [offering.course.id, offering]));
  const exams = schedule.bundles
    .flatMap((bundle) => {
      const offering = offeringByCourseId.get(bundle.courseId);
      return (offering?.examSlots ?? []).map((exam) => ({
        courseId: bundle.courseId,
        courseName: bundle.courseName,
        exam,
      }));
    })
    .sort(
      (left, right) =>
        left.exam.examDate.localeCompare(right.exam.examDate) ||
        (left.exam.examTime ?? "").localeCompare(right.exam.examTime ?? "") ||
        left.courseName.localeCompare(right.courseName, "he")
    );

  return (
    <section className="space-y-3 border-t pt-5" dir="rtl">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-right"
        aria-expanded={examsExpanded}
        onClick={() => setExamsExpanded((current) => !current)}
      >
        <span className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          <span className="text-base font-medium">מועדי בחינות</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", examsExpanded && "rotate-180")} />
      </button>
      {examsExpanded ? (exams.length ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {exams.map(({ courseId, courseName, exam }) => (
            <ExamDateCard key={`${courseId}:${exam.examDate}:${exam.examTime ?? ""}:${exam.termLabels.join("-")}`} courseName={courseName} exam={exam} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">לא פורסמו מועדי בחינה עבור הקורסים במערכת זו.</p>
      )) : null}
    </section>
  );
}

function ExamDateCard({ courseName, exam }: { courseName: string; exam: ExamSlot }) {
  const sessionLabel = exam.termLabels.join(" · ") || exam.semesterPeriod || "מועד בחינה";

  return (
    <div className="border border-border bg-muted/25 px-3 py-3">
      <div className="font-medium">{courseName}</div>
      <div className="mt-1 font-mono text-sm text-foreground">
        {formatExamDate(exam.examDate)}{exam.examTime ? ` · ${exam.examTime}` : ""}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sessionLabel}</div>
    </div>
  );
}

export function TimetableBuilder({
  plan,
  freeMode = false,
  programs = [],
}: {
  plan: DegreePlan;
  freeMode?: boolean;
  programs?: TimetableProgramOption[];
}) {
  const router = useRouter();
  const headerRef = useRef<HTMLElement | null>(null);
  const alternativesSectionRef = useRef<HTMLElement | null>(null);
  const scrollToAlternativesRef = useRef(false);
  const [semester, setSemester] = useState("1");
  const [degreeSemester, setDegreeSemester] = useState(freeMode ? "free" : "");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("manual");
  const [courseQuery, setCourseQuery] = useState("");
  const [activeCourseType, setActiveCourseType] = useState("all");
  const [activeElectiveCluster, setActiveElectiveCluster] = useState("all");
  const [completedCourseIds, setCompletedCourseIds] = useState<string[]>([]);
  const [offerings, setOfferings] = useState<ProgramCourseOffering[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [sectionSelections, setSectionSelections] = useState<SectionSelections>({});
  const [anchorSelections, setAnchorSelections] = useState<SectionSelections>({});
  const [generated, setGenerated] = useState<GeneratorResponse | null>(null);
  const [activeScheduleIndex, setActiveScheduleIndex] = useState(0);
  const [showAnchorsHelp, setShowAnchorsHelp] = useState(true);
  const [showScheduleOptionsHelp, setShowScheduleOptionsHelp] = useState(true);
  const [showProgramSelectionPrompt, setShowProgramSelectionPrompt] = useState(freeMode);
  const [interactiveSchedule, setInteractiveSchedule] = useState<GeneratedTimetable | null>(null);
  const [interactiveCourseId, setInteractiveCourseId] = useState<string | null>(null);
  const [editingCourseIds, setEditingCourseIds] = useState<string[]>([]);
  const [additionCourseTypes, setAdditionCourseTypes] = useState<AdditionCourseType[]>(["sport", "elective"]);
  const [onlyExistingDays, setOnlyExistingDays] = useState(true);
  const [preferredFreeDayIndices, setPreferredFreeDayIndices] = useState<number[]>([]);
  const [suggestions, setSuggestions] = useState<CourseAdditionSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [alternativeOverlapTab, setAlternativeOverlapTab] = useState<AlternativeOverlapTab>("no-overlaps");
  const [alternativeFreeDayCount, setAlternativeFreeDayCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timetableHydrated, setTimetableHydrated] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const storageKey = `${STORAGE_NAMESPACE}:${plan.id}:v1`;
  const timetableStorageKey = `${STORAGE_NAMESPACE}:${plan.id}:timetable:v2`;
  const panelHeightStyle = headerHeight
    ? ({ "--timetable-panel-height": `calc(100dvh - ${headerHeight + 48}px)` } as CSSProperties)
    : undefined;
  const { bachelorProgramOptions, masterProgramOptions, archivedBachelorProgramOptions, archivedMasterProgramOptions } = useMemo(() => {
    const activePrograms = programs.filter((program) => program.status !== "archived");
    const archivedPrograms = programs.filter((program) => program.status === "archived");

    return {
      bachelorProgramOptions: activePrograms.filter((program) => !program.id.startsWith("msc-")),
      masterProgramOptions: activePrograms.filter((program) => program.id.startsWith("msc-")),
      archivedBachelorProgramOptions: archivedPrograms.filter((program) => !program.id.startsWith("msc-")),
      archivedMasterProgramOptions: archivedPrograms.filter((program) => program.id.startsWith("msc-")),
    };
  }, [programs]);
  const timetablePreference = useMemo<TimetablePreference>(
    () => ({ ...TIMETABLE_PREFERENCE, preferredFreeDayIndices }),
    [preferredFreeDayIndices]
  );
  const audit = useMemo(
    () => createDegreeAudit(completedCourseIds, plan),
    [completedCourseIds, plan]
  );
  const auditByCourseId = useMemo(
    () => new Map(audit.courseAudits.map((entry) => [entry.course.id, entry])),
    [audit]
  );
  const englishPlacementIds = useMemo(
    () =>
      plan.courses
        .filter((course) => course.type === "placement" && course.id.startsWith("ENG_"))
        .map((course) => course.id),
    [plan.courses]
  );
  const englishStartLevels = useMemo(
    () =>
      ENGLISH_START_LEVELS.filter(
        (level) => !level.placementId || englishPlacementIds.includes(level.placementId)
      ),
    [englishPlacementIds]
  );
  const englishStartLevel = useMemo<EnglishStartLevel>(() => {
    const selectedPlacementId = [...ENGLISH_START_LEVELS].reverse().find(
      (level) => level.placementId && completedCourseIds.includes(level.placementId)
    )?.value;

    return selectedPlacementId ?? "basic";
  }, [completedCourseIds]);
  const selectionLocked = selectedCourseIds.length >= MAX_SELECTED_COURSES;
  const recommendedSemesters = useMemo(
    () =>
      [...new Set(plan.courses.flatMap((course) => (course.semester ? [course.semester] : [])))].sort(
        (left, right) => left - right
      ),
    [plan.courses]
  );
  const scheduledOfferings = useMemo(
    () => offerings.filter((offering) => offering.schedulable),
    [offerings]
  );
  const courseTypeTabs = useMemo(
    () => [
      { value: "all", label: "כל הקורסים", count: scheduledOfferings.length },
      ...plan.courseTypes
        .map((courseType) => ({
          value: `type:${courseType.code}`,
          label: courseType.label,
          count: scheduledOfferings.filter((offering) => offering.course.type === courseType.code).length,
        }))
        .filter((tab) => tab.count > 0),
    ],
    [plan.courseTypes, scheduledOfferings]
  );
  const electiveClusterTabs = useMemo(() => {
    const electiveOfferings = scheduledOfferings.filter((offering) => offering.course.type === "elective");
    const clusteredTabs = plan.clusters
      .map((cluster) => ({
        value: cluster.id,
        label: cluster.name,
        count: electiveOfferings.filter((offering) => offering.course.clusterId === cluster.id).length,
      }))
      .filter((tab) => tab.count > 0);
    const withoutClusterCount = electiveOfferings.filter((offering) => !offering.course.clusterId).length;

    return [
      { value: "all", label: "כל האשכולות", count: electiveOfferings.length },
      ...clusteredTabs,
      ...(withoutClusterCount ? [{ value: "none", label: "ללא אשכול", count: withoutClusterCount }] : []),
    ];
  }, [plan.clusters, scheduledOfferings]);
  const effectiveElectiveCluster = electiveClusterTabs.some((tab) => tab.value === activeElectiveCluster)
    ? activeElectiveCluster
    : "all";
  // Normalizing search text and ICU-collated sorting are the expensive parts, and
  // neither depends on the query — precompute them once per offerings/audit change so
  // each keystroke only runs a cheap substring check over ready-made strings.
  const searchableOfferings = useMemo(
    () =>
      [...scheduledOfferings]
        .sort((left, right) => {
          const leftLegal = auditByCourseId.get(left.course.id)?.available ? 0 : 1;
          const rightLegal = auditByCourseId.get(right.course.id)?.available ? 0 : 1;
          return leftLegal - rightLegal || canonicalCourseName(left).localeCompare(canonicalCourseName(right), "he");
        })
        .map((offering) => ({
          offering,
          searchText: normalizedSearchText(
            [
              offering.course.id,
              canonicalCourseName(offering),
              offering.course.name,
              ...offering.sections.map((section) => section.affiliationNote ?? ""),
            ].join(" ")
          ),
        })),
    [auditByCourseId, scheduledOfferings]
  );
  const visibleOfferings = useMemo(() => {
    const query = normalizedSearchText(courseQuery.trim());

    return searchableOfferings
      .filter(({ offering }) =>
        activeCourseType === "all" || offering.course.type === activeCourseType.replace("type:", "")
      )
      .filter(({ offering }) => {
        if (activeCourseType !== "type:elective" || effectiveElectiveCluster === "all") return true;
        if (effectiveElectiveCluster === "none") return !offering.course.clusterId;
        return offering.course.clusterId === effectiveElectiveCluster;
      })
      .filter(({ searchText }) => !query || searchText.includes(query))
      .map(({ offering }) => offering);
  }, [activeCourseType, courseQuery, effectiveElectiveCluster, searchableOfferings]);
  const visibleOfferingGroups = useMemo(() => {
    if (activeCourseType !== "type:required") {
      return [{ key: "all", label: null, offerings: visibleOfferings }];
    }

    const bySemester = new Map<number | null, ProgramCourseOffering[]>();
    for (const offering of visibleOfferings) {
      const semesterKey = offering.course.semester ?? null;
      const group = bySemester.get(semesterKey) ?? [];
      group.push(offering);
      bySemester.set(semesterKey, group);
    }

    return [...bySemester.entries()]
      .sort(([left], [right]) => (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER))
      .map(([recommendedSemester, groupedOfferings]) => ({
        key: recommendedSemester === null ? "unassigned" : String(recommendedSemester),
        label: recommendedSemester === null ? "ללא סמסטר מומלץ" : `סמסטר ${recommendedSemester}`,
        offerings: groupedOfferings,
      }));
  }, [activeCourseType, visibleOfferings]);
  const selectedOfferings = useMemo(
    () => offerings.filter((offering) => selectedCourseIds.includes(offering.course.id)),
    [offerings, selectedCourseIds]
  );
  const selectedSchedule = interactiveSchedule ?? generated?.schedules[activeScheduleIndex] ?? generated?.schedules[0] ?? null;
  // The explicit "no semester" mode is for browsing every scheduled course without
  // adopting the degree map's recommended selection. The empty value remains the
  // initial prompt, where the list intentionally stays hidden until a choice is made.
  const canBrowseOfferings = freeMode || degreeSemester !== "";
  const displayedSectionSelections = useMemo(
    () =>
      selectedSchedule && !interactiveSchedule
        ? sectionSelectionsForSchedule(selectedSchedule)
        : sectionSelections,
    [interactiveSchedule, sectionSelections, selectedSchedule]
  );
  const hasGeneratedSchedule = Boolean(generated?.schedules.length && selectedSchedule);
  const alternativeEntries = useMemo(
    () => (generated?.schedules ?? []).map((schedule, index) => ({ schedule, index })),
    [generated]
  );
  const resolvedAlternativeOverlapTab = alternativeOverlapTab;
  const overlapFilteredAlternatives = alternativeEntries.filter(({ schedule }) =>
    resolvedAlternativeOverlapTab === "no-overlaps" ? schedule.overlapMinutes === 0 : schedule.overlapMinutes > 0
  );
  const availableAlternativeFreeDayCounts = [...new Set(overlapFilteredAlternatives.map(({ schedule }) => schedule.freeDayCount))]
    .sort((left, right) => right - left);
  const resolvedAlternativeFreeDayCount = availableAlternativeFreeDayCounts.includes(alternativeFreeDayCount ?? -1)
    ? alternativeFreeDayCount
    : availableAlternativeFreeDayCounts[0] ?? null;
  const displayedAlternativeEntries = resolvedAlternativeFreeDayCount === null
    ? overlapFilteredAlternatives
    : overlapFilteredAlternatives.filter(({ schedule }) => schedule.freeDayCount === resolvedAlternativeFreeDayCount);
  const resolvedActiveScheduleIndex = displayedAlternativeEntries.some(({ index }) => index === activeScheduleIndex)
    ? activeScheduleIndex
    : displayedAlternativeEntries[0]?.index ?? 0;
  const displayedAlternativeSchedule = interactiveSchedule
    ?? displayedAlternativeEntries.find(({ index }) => index === resolvedActiveScheduleIndex)?.schedule
    ?? displayedAlternativeEntries[0]?.schedule
    ?? null;
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeaderHeight = () => setHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);

    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!scrollToAlternativesRef.current || !generated?.schedules.length) return;

    const scrollTimer = window.setTimeout(() => {
      alternativesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      scrollToAlternativesRef.current = false;
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [generated]);
  const visualWarnings = useMemo(() => {
    if (!interactiveSchedule) return [];

    return interactiveSchedule.bundles.flatMap((bundle) => {
      const offering = offerings.find((candidate) => candidate.course.id === bundle.courseId);
      if (!offering) return [];

      const expectedSectionTypes = [
        ...new Set(
          offering.sections
            .filter((section) => section.scheduleStatus === "scheduled" && section.meetings.length)
            .map((section) => section.sectionType)
        ),
      ];
      const selectedByType = new Map<string, number>();
      for (const section of bundle.sections) {
        selectedByType.set(section.sectionType, (selectedByType.get(section.sectionType) ?? 0) + 1);
      }

      return expectedSectionTypes.flatMap((sectionType) => {
        const selectedCount = selectedByType.get(sectionType) ?? 0;
        if (selectedCount === 0) return [`חסר ${sectionType} בקורס ${canonicalCourseName(offering)}.`];
        if (selectedCount > 1) return [`נבחרו ${selectedCount} קבוצות מסוג ${sectionType} בקורס ${canonicalCourseName(offering)}.`];
        return [];
      });
    });
  }, [interactiveSchedule, offerings]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const savedCourseIds = readCompletedCourses(storageKey);
      setCompletedCourseIds((current) =>
        sameCourseIds(current, savedCourseIds) ? current : savedCourseIds
      );
    }, 0);

    return () => {
      window.clearTimeout(hydrationTimer);
    };
  }, [storageKey]);

  useEffect(() => {
    // New split format (:ui + :generated); the plain key is the pre-split fallback
    // so existing saved sessions survive the upgrade.
    const savedUi = readTimetableState(`${timetableStorageKey}:ui`);
    const savedGenerated = readTimetableState(`${timetableStorageKey}:generated`);
    const legacy = savedUi ? null : readTimetableState(timetableStorageKey);
    const saved: PersistedTimetableState | null =
      savedUi || savedGenerated ? { ...(savedUi ?? {}), ...(savedGenerated ?? {}) } : legacy;

    const hydrationTimer = window.setTimeout(() => {
      if (saved) {
        if (typeof saved.semester === "string") setSemester(saved.semester);
        if (typeof saved.degreeSemester === "string") setDegreeSemester(saved.degreeSemester);
        if (saved.selectionMode === "map" || saved.selectionMode === "manual") setSelectionMode(saved.selectionMode);
        if (typeof saved.courseQuery === "string") setCourseQuery(saved.courseQuery);
        if (typeof saved.activeCourseType === "string") setActiveCourseType(saved.activeCourseType);
        if (typeof saved.activeElectiveCluster === "string") setActiveElectiveCluster(saved.activeElectiveCluster);
        if (Array.isArray(saved.selectedCourseIds)) setSelectedCourseIds(saved.selectedCourseIds.filter((value): value is string => typeof value === "string"));
        if (saved.sectionSelections && typeof saved.sectionSelections === "object") setSectionSelections(saved.sectionSelections);
        if (saved.anchorSelections && typeof saved.anchorSelections === "object") setAnchorSelections(saved.anchorSelections);
        if (saved.generated === null || (saved.generated && typeof saved.generated === "object")) setGenerated(saved.generated);
        if (typeof saved.activeScheduleIndex === "number" && Number.isInteger(saved.activeScheduleIndex)) setActiveScheduleIndex(saved.activeScheduleIndex);
        if (typeof saved.showAnchorsHelp === "boolean") setShowAnchorsHelp(saved.showAnchorsHelp);
        if (typeof saved.showScheduleOptionsHelp === "boolean") setShowScheduleOptionsHelp(saved.showScheduleOptionsHelp);
        if (freeMode && typeof saved.showProgramSelectionPrompt === "boolean") setShowProgramSelectionPrompt(saved.showProgramSelectionPrompt);
        if (saved.interactiveSchedule === null || (saved.interactiveSchedule && typeof saved.interactiveSchedule === "object")) setInteractiveSchedule(saved.interactiveSchedule);
        if (typeof saved.interactiveCourseId === "string" || saved.interactiveCourseId === null) setInteractiveCourseId(saved.interactiveCourseId);
        if (Array.isArray(saved.editingCourseIds)) setEditingCourseIds(saved.editingCourseIds.filter((value): value is string => typeof value === "string"));
        if (Array.isArray(saved.additionCourseTypes)) setAdditionCourseTypes(saved.additionCourseTypes.filter((value): value is AdditionCourseType => value === "general" || value === "elective" || value === "sport"));
        if (typeof saved.onlyExistingDays === "boolean") setOnlyExistingDays(saved.onlyExistingDays);
        if (Array.isArray(saved.preferredFreeDayIndices)) {
          setPreferredFreeDayIndices(
            [...new Set(saved.preferredFreeDayIndices.filter((dayIndex): dayIndex is number => typeof dayIndex === "number" && Number.isInteger(dayIndex) && dayIndex >= 1 && dayIndex <= 6))]
          );
        }
        if (Array.isArray(saved.suggestions)) setSuggestions(saved.suggestions);
        if (saved.alternativeOverlapTab === "no-overlaps" || saved.alternativeOverlapTab === "with-overlaps") setAlternativeOverlapTab(saved.alternativeOverlapTab);
        if (saved.alternativeFreeDayCount === null || (typeof saved.alternativeFreeDayCount === "number" && Number.isInteger(saved.alternativeFreeDayCount))) setAlternativeFreeDayCount(saved.alternativeFreeDayCount);
      }

      setTimetableHydrated(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, [freeMode, timetableStorageKey]);

  // Persistence is split in two: cheap UI state is written immediately, while the
  // heavy generator output (up to ~0.5 MB of schedules/suggestions serialized JSON)
  // is debounced so typing in the search box or toggling checkboxes never pays a
  // synchronous multi-hundred-KB JSON.stringify + localStorage write per keystroke.
  const persistedHeavyState = useMemo(
    () => ({ generated, interactiveSchedule, suggestions }),
    [generated, interactiveSchedule, suggestions]
  );

  useEffect(() => {
    if (!timetableHydrated) return;

    try {
      window.localStorage.setItem(
        `${timetableStorageKey}:ui`,
        JSON.stringify({
          semester,
          degreeSemester,
          selectionMode,
          courseQuery,
          activeCourseType,
          activeElectiveCluster,
          selectedCourseIds,
          sectionSelections,
          anchorSelections,
          activeScheduleIndex,
          showAnchorsHelp,
          showScheduleOptionsHelp,
          showProgramSelectionPrompt,
          interactiveCourseId,
          editingCourseIds,
          additionCourseTypes,
          onlyExistingDays,
          preferredFreeDayIndices,
          alternativeOverlapTab,
          alternativeFreeDayCount,
        })
      );
    } catch {
      // A full or unavailable local storage must not interrupt timetable editing.
    }
  }, [
    activeCourseType,
    activeElectiveCluster,
    activeScheduleIndex,
    additionCourseTypes,
    alternativeFreeDayCount,
    alternativeOverlapTab,
    anchorSelections,
    courseQuery,
    degreeSemester,
    editingCourseIds,
    interactiveCourseId,
    onlyExistingDays,
    preferredFreeDayIndices,
    sectionSelections,
    selectedCourseIds,
    selectionMode,
    semester,
    timetableHydrated,
    timetableStorageKey,
    showAnchorsHelp,
    showProgramSelectionPrompt,
    showScheduleOptionsHelp,
  ]);

  useEffect(() => {
    if (!timetableHydrated) return;

    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`${timetableStorageKey}:generated`, JSON.stringify(persistedHeavyState));
      } catch {
        // A full or unavailable local storage must not interrupt timetable editing.
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [persistedHeavyState, timetableHydrated, timetableStorageKey]);

  // Offerings depend only on program+semester; the audit depends only on the plan and
  // the completed courses. Keeping them separate avoids refetching a quarter-megabyte
  // offerings payload whenever the user changes their English level or completions.
  useEffect(() => {
    const controller = new AbortController();
    const offeringsCacheKey = `${plan.id}:${semester}`;

    async function load() {
      setError(null);
      setLoading(true);
      try {
        const cachedOfferings = readCachedOfferings(offeringsCacheKey);
        if (cachedOfferings) {
          setOfferings(cachedOfferings);
          return;
        }

        const offeringsResponse = await fetch(`/api/offerings?programId=${encodeURIComponent(plan.id)}&semester=${semester}`, {
          signal: controller.signal,
        });
        if (!offeringsResponse.ok) throw new Error("טעינת הנתונים נכשלה.");

        const nextOfferings = (await offeringsResponse.json()) as ProgramCourseOffering[];
        cacheOfferings(offeringsCacheKey, nextOfferings);
        setOfferings(nextOfferings);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "טעינת הנתונים נכשלה.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [plan.id, semester]);

  function clearGenerated() {
    setGenerated(null);
    setActiveScheduleIndex(0);
    setInteractiveSchedule(null);
    setInteractiveCourseId(null);
    setEditingCourseIds([]);
    setSuggestions([]);
    setSuggestionsError(null);
  }

  function clearGeneratedPreservingEditors() {
    setGenerated(null);
    setActiveScheduleIndex(0);
    setInteractiveSchedule(null);
    setInteractiveCourseId(null);
    setSuggestions([]);
    setSuggestionsError(null);
  }

  function resetTimetable() {
    setSemester("1");
    setDegreeSemester(freeMode ? "free" : "");
    setSelectionMode("manual");
    setCourseQuery("");
    setActiveCourseType("all");
    setActiveElectiveCluster("all");
    setSelectedCourseIds([]);
    setSectionSelections({});
    setAnchorSelections({});
    setGenerated(null);
    setActiveScheduleIndex(0);
    setShowAnchorsHelp(true);
    setShowScheduleOptionsHelp(true);
    setShowProgramSelectionPrompt(freeMode);
    setInteractiveSchedule(null);
    setInteractiveCourseId(null);
    setEditingCourseIds([]);
    setAdditionCourseTypes(["sport", "elective"]);
    setOnlyExistingDays(true);
    setPreferredFreeDayIndices([]);
    setSuggestions([]);
    setAlternativeOverlapTab("no-overlaps");
    setAlternativeFreeDayCount(null);
    setSuggestionsError(null);
    setError(null);
    window.localStorage.removeItem(timetableStorageKey);
    window.localStorage.removeItem(`${timetableStorageKey}:ui`);
    window.localStorage.removeItem(`${timetableStorageKey}:generated`);
  }

  function changeProgram(nextProgramId: string) {
    if (!nextProgramId || nextProgramId === plan.id) return;
    if (nextProgramId !== "free-timetable") setShowProgramSelectionPrompt(false);
    router.push(nextProgramId === "free-timetable" ? "/timetable/free" : `/p/${nextProgramId}/timetable`);
  }

  function toggleCourse(courseId: string, checked: boolean) {
    const scheduleAfterRemoval = !checked && selectedSchedule
      ? createInteractiveSchedule(selectedSchedule.bundles.filter((bundle) => bundle.courseId !== courseId))
      : null;

    if (scheduleAfterRemoval) {
      setInteractiveSchedule(scheduleAfterRemoval);
      setInteractiveCourseId(null);
    } else if (!interactiveSchedule) {
      clearGenerated();
    }

    setSelectedCourseIds((current) => {
      if (!checked) return current.filter((id) => id !== courseId);
      return current.length >= MAX_SELECTED_COURSES ? current : [...current, courseId];
    });
    if (!checked) {
      setEditingCourseIds((current) => current.filter((id) => id !== courseId));
      setInteractiveSchedule((current) =>
        current ? createInteractiveSchedule(current.bundles.filter((bundle) => bundle.courseId !== courseId)) : null
      );
      setSectionSelections((current) => {
        if (!current[courseId]) return current;
        const next = { ...current };
        delete next[courseId];
        return next;
      });
      setAnchorSelections((current) => {
        if (!current[courseId]) return current;
        const next = { ...current };
        delete next[courseId];
        return next;
      });
    } else {
      setEditingCourseIds((current) => (current.includes(courseId) ? current : [...current, courseId]));
    }
  }

  function toggleCourseEditor(courseId: string) {
    setEditingCourseIds((current) =>
      current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]
    );
  }

  function toggleSection(courseId: string, sectionType: string, sectionId: number, checked: boolean) {
    const offering = offerings.find((candidate) => candidate.course.id === courseId);
    if (!offering) return;

    const scheduleToEdit = interactiveSchedule ?? selectedSchedule;
    const initialSelections = scheduleToEdit ? sectionSelectionsForSchedule(scheduleToEdit) : sectionSelections;
    const courseSelections = initialSelections[courseId] ?? {};
    const hasManualSelection = Object.prototype.hasOwnProperty.call(courseSelections, sectionType);
    const automaticIds = offering.sections
      .filter((section) => section.sectionType === sectionType && sectionCanBeScheduled(section))
      .map((section) => section.id);
    const previousIds = hasManualSelection ? courseSelections[sectionType] ?? [] : automaticIds;
    const nextIds = checked
      ? [...new Set([...previousIds, sectionId])]
      : previousIds.filter((id) => id !== sectionId);

    if (checked) {
      setSelectedCourseIds((current) => {
        if (current.includes(courseId) || current.length >= MAX_SELECTED_COURSES) return current;
        return [...current, courseId];
      });
    }

    setSectionSelections((current) =>
      withSectionSelection(interactiveSchedule ? current : initialSelections, courseId, sectionType, nextIds)
    );

    if (scheduleToEdit) {
      setInteractiveCourseId(courseId);
      setEditingCourseIds((current) => (current.includes(courseId) ? current : [...current, courseId]));
      setInteractiveSchedule(withScheduleSectionType(scheduleToEdit, offering, sectionType, nextIds));
    } else if (!interactiveSchedule) {
      clearGeneratedPreservingEditors();
    }
  }

  function toggleAnchor(courseId: string, sectionType: string, sectionId: number, checked: boolean) {
    const offering = offerings.find((candidate) => candidate.course.id === courseId);
    if (!offering) return;

    if (checked) {
      setSelectedCourseIds((current) => {
        if (current.includes(courseId) || current.length >= MAX_SELECTED_COURSES) return current;
        return [...current, courseId];
      });
    }

    setAnchorSelections((current) => {
      const courseSelections = current[courseId] ?? {};
      const manuallyAnchored = Object.prototype.hasOwnProperty.call(courseSelections, sectionType);
      const previousIds = manuallyAnchored
        ? courseSelections[sectionType] ?? []
        : selectableSectionIds(offering, sectionType);
      const nextIds = checked
        ? [...new Set([...previousIds, sectionId])]
        : previousIds.filter((id) => id !== sectionId);

      return withSectionSelection(current, courseId, sectionType, nextIds);
    });
  }

  function resetSectionType(courseId: string, sectionType: string) {
    if (interactiveSchedule) {
      const offering = offerings.find((candidate) => candidate.course.id === courseId);
      if (!offering) return;
      setInteractiveCourseId(courseId);
      setEditingCourseIds((current) => (current.includes(courseId) ? current : [...current, courseId]));
      setSectionSelections((current) => withSectionSelection(current, courseId, sectionType, []));
      setInteractiveSchedule(withScheduleSectionType(interactiveSchedule, offering, sectionType, []));
      return;
    }

    setSectionSelections((current) => withSectionSelection(current, courseId, sectionType, undefined));
    if (!selectedSchedule) clearGeneratedPreservingEditors();
  }

  function recommendedCourseIds(
    nextDegreeSemester: string,
    nextSelectionMode: SelectionMode,
    courseAudits = auditByCourseId,
    nextEnglishStartLevel = englishStartLevel
  ) {
    if (!nextDegreeSemester || nextDegreeSemester === "none") return [];

    const degreeSemesterNumber = Number(nextDegreeSemester);
    const manualEnglishLevel = nextSelectionMode === "manual" && nextEnglishStartLevel !== "exempt"
      ? ({ basic: 0, "advanced-a": 1, "advanced-b": 2 } as const)[nextEnglishStartLevel] + degreeSemesterNumber - 1
      : null;
    const manualEnglishCourseId = manualEnglishLevel !== null && manualEnglishLevel >= 0 && manualEnglishLevel <= 2
      ? scheduledOfferings.find((offering) => englishCourseLevel(offering.course) === manualEnglishLevel)?.course.id ?? null
      : null;
    const selectedIds = scheduledOfferings
      .filter((offering) => offering.course.semester === Number(nextDegreeSemester))
      .filter((offering) => !isAcademicHebrewCourse(offering.course))
      .filter((offering) => nextSelectionMode !== "manual" || englishCourseLevel(offering.course) === null)
      .filter((offering) => {
        const courseAudit = courseAudits.get(offering.course.id);
        if (courseAudit?.completed) return false;

        return nextSelectionMode === "manual"
          ? !courseAudit || courseAudit.available || courseAudit.blockedByPrerequisite
          : Boolean(courseAudit?.available);
      })
      .map((offering) => offering.course.id);

    if (!manualEnglishCourseId) return selectedIds.slice(0, MAX_SELECTED_COURSES);

    return [...selectedIds.filter((courseId) => courseId !== manualEnglishCourseId).slice(0, MAX_SELECTED_COURSES - 1), manualEnglishCourseId];
  }

  function selectDegreeSemester(nextDegreeSemester: string, nextSelectionMode = selectionMode) {
    setDegreeSemester(nextDegreeSemester);
    clearGenerated();
    setSectionSelections({});
    setAnchorSelections({});

    if (!nextDegreeSemester || nextDegreeSemester === "none") {
      setSelectedCourseIds([]);
      setEditingCourseIds([]);
      return;
    }

    const selectedRecommendedCourses = recommendedCourseIds(nextDegreeSemester, nextSelectionMode);

    setSelectedCourseIds(selectedRecommendedCourses);
    setEditingCourseIds(selectedRecommendedCourses);
  }

  function expandAllSelectedCourses() {
    setEditingCourseIds(selectedCourseIds);
  }

  function collapseAllSelectedCourses() {
    setEditingCourseIds([]);
  }

  function selectAlternativeOverlapTab(nextTab: AlternativeOverlapTab) {
    const candidates = alternativeEntries.filter(({ schedule }) =>
      nextTab === "no-overlaps" ? schedule.overlapMinutes === 0 : schedule.overlapMinutes > 0
    );
    setAlternativeOverlapTab(nextTab);
    setInteractiveSchedule(null);
    setInteractiveCourseId(null);
    if (!candidates.length) {
      setAlternativeFreeDayCount(null);
      return;
    }

    const nextFreeDayCount = Math.max(...candidates.map(({ schedule }) => schedule.freeDayCount));
    const nextScheduleIndex = candidates.find(({ schedule }) => schedule.freeDayCount === nextFreeDayCount)?.index ?? candidates[0].index;

    setAlternativeFreeDayCount(nextFreeDayCount);
    setActiveScheduleIndex(nextScheduleIndex);
  }

  function selectAlternativeFreeDayCount(nextFreeDayCount: number) {
    const nextScheduleIndex = overlapFilteredAlternatives.find(
      ({ schedule }) => schedule.freeDayCount === nextFreeDayCount
    )?.index;
    if (nextScheduleIndex === undefined) return;

    setAlternativeFreeDayCount(nextFreeDayCount);
    setActiveScheduleIndex(nextScheduleIndex);
    setInteractiveSchedule(null);
    setInteractiveCourseId(null);
  }

  function startInteractiveEditing(schedule: GeneratedTimetable, courseId = schedule.bundles[0]?.courseId ?? null) {
    const nextSelections = sectionSelectionsForSchedule(schedule);
    const nextCourseIds = schedule.bundles.map((bundle) => bundle.courseId);

    setSelectedCourseIds(nextCourseIds);
    setSectionSelections(nextSelections);
    setEditingCourseIds(nextCourseIds);
    setInteractiveSchedule(schedule);
    setInteractiveCourseId(courseId);
    setSuggestionsError(null);
  }

  function toggleSuggestedAddition(suggestion: CourseAdditionSuggestion) {
    if (!selectedSchedule) return;

    const suggestionCourseIds = new Set(suggestion.addedCourseIds);
    const isSelected = scheduleIncludesCourseIds(selectedSchedule, suggestion.addedCourseIds);
    const nextBundles = isSelected
      ? selectedSchedule.bundles.filter((bundle) => !suggestionCourseIds.has(bundle.courseId))
      : [
          ...selectedSchedule.bundles.filter((bundle) => !suggestionCourseIds.has(bundle.courseId)),
          ...suggestion.schedule.bundles.filter((bundle) => suggestionCourseIds.has(bundle.courseId)),
        ];
    const nextSchedule = createInteractiveSchedule(nextBundles);

    startInteractiveEditing(nextSchedule, nextSchedule.bundles[0]?.courseId ?? null);
  }

  function findSuggestedAdditions() {
    if (!selectedSchedule || !additionCourseTypes.length) return;

    setSuggesting(true);
    setSuggestionsError(null);
    try {
      const baseCourseIds = new Set(selectedSchedule.bundles.map((bundle) => bundle.courseId));
      const candidateOfferings = scheduledOfferings
        .filter((offering) => !baseCourseIds.has(offering.course.id))
        .filter((offering) => additionCourseTypes.includes(offering.course.type as AdditionCourseType))
        .filter((offering) => selectionMode === "manual" || Boolean(auditByCourseId.get(offering.course.id)?.available));
      const nextSuggestions = suggestCourseAdditions(selectedSchedule, candidateOfferings, additionCourseTypes, {
        ...timetablePreference,
      });

      setSuggestions(onlyExistingDays ? nextSuggestions.filter((suggestion) => suggestion.addedDayCount === 0) : nextSuggestions);
    } catch (suggestionError) {
      setSuggestionsError(suggestionError instanceof Error ? suggestionError.message : "לא ניתן למצוא התאמות כרגע.");
    } finally {
      setSuggesting(false);
    }
  }

  function toggleAdditionCourseType(courseType: AdditionCourseType, checked: boolean) {
    setAdditionCourseTypes((current) =>
      checked ? [...new Set([...current, courseType])] : current.filter((value) => value !== courseType)
    );
    setSuggestions([]);
    setSuggestionsError(null);
  }

  function togglePreferredFreeDay(dayIndex: number, checked: boolean) {
    setPreferredFreeDayIndices((current) =>
      checked ? [...new Set([...current, dayIndex])].sort((left, right) => left - right) : current.filter((value) => value !== dayIndex)
    );
    setSuggestions([]);
    setSuggestionsError(null);
  }

  function selectSemester(nextSemester: string) {
    if (nextSemester === semester) return;
    setSemester(nextSemester);
    setActiveCourseType("all");
    setActiveElectiveCluster("all");
    setSelectedCourseIds([]);
    setSectionSelections({});
    setAnchorSelections({});
    clearGenerated();
  }

  function selectEnglishStartLevel(level: EnglishStartLevel) {
    const selectedLevel = ENGLISH_START_LEVELS.find((option) => option.value === level);
    if (!selectedLevel) return;

    clearGenerated();
    const nextCourseIds = completedCourseIds.filter((courseId) => !englishPlacementIds.includes(courseId));
    if (selectedLevel.placementId) nextCourseIds.push(selectedLevel.placementId);

    const nextAudit = createDegreeAudit(nextCourseIds, plan);
    const nextAuditByCourseId = new Map(nextAudit.courseAudits.map((entry) => [entry.course.id, entry]));
    const nextSelectedCourseIds = recommendedCourseIds(
      degreeSemester,
      selectionMode,
      nextAuditByCourseId,
      selectedLevel.value
    );

    setCompletedCourseIds(nextCourseIds);
    setSectionSelections({});
    setAnchorSelections({});
    setSelectedCourseIds(nextSelectedCourseIds);
    setEditingCourseIds(nextSelectedCourseIds);
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ selectedCourseIds: nextCourseIds, updatedAt: new Date().toISOString() })
    );
  }

  function generate() {
    if (!selectedCourseIds.length) return;
    const isRegeneratingInteractiveSchedule = Boolean(interactiveSchedule);
    setGenerating(true);
    setError(null);
    try {
      const planCourseIds = new Set(plan.courses.map((course) => course.id));
      const requestedCourseIds = selectedCourseIds.filter((courseId) => planCourseIds.has(courseId));
      const blockedCourseIds = selectionMode === "map"
        ? requestedCourseIds.filter((courseId) => !auditByCourseId.get(courseId)?.available)
        : [];
      const eligibleCourseIds = requestedCourseIds.filter((courseId) => !blockedCourseIds.includes(courseId));
      const offeringByCourseId = new Map(offerings.map((offering) => [offering.course.id, offering]));
      const eligibleOfferings = eligibleCourseIds
        .map((courseId) => offeringByCourseId.get(courseId))
        .filter((offering): offering is ProgramCourseOffering => Boolean(offering));
      const notOfferedCourseIds = eligibleCourseIds.filter((courseId) => !offeringByCourseId.get(courseId)?.schedulable);
      const generatedTimetables = generateTimetables(
        eligibleOfferings.filter((offering) => offering.schedulable),
        74,
        anchorSelections,
        timetablePreference
      );
      const payload: GeneratorResponse = {
        requestedCourseIds,
        blockedCourseIds,
        notOfferedCourseIds,
        coursesWithoutBundles: generatedTimetables.coursesWithoutBundles,
        schedules: generatedTimetables.schedules,
      };
      scrollToAlternativesRef.current = payload.schedules.length > 0;
      setGenerated(payload);
      const initialOverlapTab: AlternativeOverlapTab = payload.schedules.some((schedule) => schedule.overlapMinutes === 0)
        ? "no-overlaps"
        : "with-overlaps";
      const initialSchedules = payload.schedules
        .map((schedule, index) => ({ schedule, index }))
        .filter(({ schedule }) => initialOverlapTab === "no-overlaps" ? schedule.overlapMinutes === 0 : schedule.overlapMinutes > 0);
      const initialFreeDayCount = initialSchedules.length
        ? Math.max(...initialSchedules.map(({ schedule }) => schedule.freeDayCount))
        : null;
      const initialScheduleIndex = initialSchedules.find(({ schedule }) => schedule.freeDayCount === initialFreeDayCount)?.index ?? 0;
      setAlternativeOverlapTab(initialOverlapTab);
      setAlternativeFreeDayCount(initialFreeDayCount);
      setActiveScheduleIndex(initialScheduleIndex);
      setInteractiveSchedule(null);
      setInteractiveCourseId(null);
      if (isRegeneratingInteractiveSchedule) setSectionSelections({});
      setSuggestions([]);
      setSuggestionsError(null);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "יצירת המערכות נכשלה.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground" dir="rtl">
        <header ref={headerRef} className="border-b bg-card">
          <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
              <div className="flex flex-wrap items-center gap-3 lg:justify-self-start">
                <h1 className="flex items-center gap-2 text-2xl font-semibold"><CalendarDays className="size-6 text-primary" />מערכת שעות</h1>
              </div>
              <div className="flex gap-2 lg:justify-self-center">
                <Button variant={semester === "1" ? "default" : "outline"} onClick={() => selectSemester("1")}>סמסטר א׳</Button>
                <Button variant={semester === "2" ? "default" : "outline"} onClick={() => selectSemester("2")}>סמסטר ב׳</Button>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-self-end">
                <Button variant="outline" asChild>
                  <Link href={freeMode ? "/timetable" : `/p/${plan.id}`}><ArrowRight />{freeMode ? "בחירת מסלול" : "מפת התואר"}</Link>
                </Button>
                {!freeMode ? (
                  <Button variant="outline" onClick={() => setCompletedCourseIds(readCompletedCourses(storageKey))}>
                    <RefreshCw />רענון השלמות
                  </Button>
                ) : null}
                <Button variant="destructive" onClick={resetTimetable}>
                  <RotateCcw />ניקוי
                </Button>
              </div>
            </div>

            {englishStartLevels.length > 1 || programs.length ? (
              <div className="flex flex-col gap-4 border-t pt-3 lg:flex-row lg:flex-nowrap lg:items-center lg:gap-x-8">
                {englishStartLevels.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium">רמת אנגלית בתחילת התואר</span>
                    <Tabs value={englishStartLevel} onValueChange={(value) => selectEnglishStartLevel(value as EnglishStartLevel)}>
                      <TabsList className="h-auto flex-wrap gap-1 bg-muted/45 p-1">
                        {englishStartLevels.map((level) => (
                          <TabsTrigger key={level.value} value={level.value} className="px-2.5">
                            {level.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                ) : null}
                {programs.length ? (
                  <label className="flex shrink-0 flex-wrap items-center gap-2 border-s border-primary/25 ps-5 text-sm">
                    <span className="font-semibold text-foreground">תוכנית לימודים</span>
                    <select
                      value={freeMode ? "free-timetable" : plan.id}
                      onChange={(event) => changeProgram(event.target.value)}
                      className="h-9 max-w-full rounded-md border border-primary/35 bg-primary/5 px-2 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="free-timetable">מערכת חופשית</option>
                      {bachelorProgramOptions.length ? (
                        <optgroup label="תואר ראשון">
                          {bachelorProgramOptions.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
                        </optgroup>
                      ) : null}
                      {masterProgramOptions.length ? (
                        <optgroup label="תואר שני">
                          {masterProgramOptions.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
                        </optgroup>
                      ) : null}
                      {archivedBachelorProgramOptions.length ? (
                        <optgroup label="ארכיון - תואר ראשון">
                          {archivedBachelorProgramOptions.map((program) => (
                            <option key={program.id} value={program.id}>
                              {program.title} ({program.catalogYear ?? "שנתון קודם"})
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {archivedMasterProgramOptions.length ? (
                        <optgroup label="ארכיון - תואר שני">
                          {archivedMasterProgramOptions.map((program) => (
                            <option key={program.id} value={program.id}>
                              {program.title} ({program.catalogYear ?? "שנתון קודם"})
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </label>
                ) : null}
                {freeMode && showProgramSelectionPrompt ? (
                  <div role="alert" className="flex items-start gap-2 border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive lg:w-[30rem] lg:shrink-0">
                    <ArrowUp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-xs leading-5 font-medium">לבחירת קורסים לפי תואר, בחרו תוכנית לימודים.</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setShowProgramSelectionPrompt(false)}
                          className="grid size-6 shrink-0 place-items-center transition-colors hover:bg-destructive/10"
                          aria-label="הסתרת הודעת בחירת תוכנית לימודים"
                        >
                          <X className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>הסתרה</TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <main
          className="mx-auto grid w-full max-w-[110rem] gap-6 px-4 py-6 lg:items-start lg:grid-cols-[minmax(0,1fr)_390px] lg:px-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:px-8"
          dir="ltr"
          style={panelHeightStyle}
        >
          <section className="min-h-0 lg:h-[var(--timetable-panel-height)]" dir="rtl">
            <Card className="h-full min-h-0">
              <CardHeader className="shrink-0 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle>{freeMode ? "בחירת קורסים חופשית" : "בחירת קורסים"}</CardTitle>
                  {!freeMode ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">סמסטר בתואר</span>
                        <select
                          value={degreeSemester}
                          onChange={(event) => selectDegreeSemester(event.target.value)}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <option value="" disabled>סמסטר --</option>
                          <option value="none">ללא בחירת סמסטר</option>
                          {recommendedSemesters.map((recommendedSemester) => (
                            <option key={recommendedSemester} value={recommendedSemester}>סמסטר {recommendedSemester}</option>
                          ))}
                        </select>
                      </label>
                      <Tabs
                        value={selectionMode}
                        onValueChange={(value) => {
                          const nextSelectionMode = value as SelectionMode;
                          setSelectionMode(nextSelectionMode);
                          selectDegreeSemester(degreeSemester, nextSelectionMode);
                        }}
                      >
                        <TabsList className="h-auto gap-1 bg-muted/45 p-1">
                          <TabsTrigger value="map" className="px-3">מהמפה</TabsTrigger>
                          <TabsTrigger value="manual" className="px-3">ידני</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  ) : null}
                </div>
                {showAnchorsHelp ? (
                  <div className="flex gap-2 border border-warning/30 bg-warning/10 px-3 py-2.5 text-right text-xs leading-5 text-foreground">
                    <Anchor className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    <p className="min-w-0 flex-1"><strong>עוגנים לחישוב:</strong> לאחר בחירת קורסים, פתחו קורס ובחרו אילו קבוצות ייכללו בחלופות; כל הקבוצות הן עוגן כברירת מחדל. לאחר יצירת מערכת אפשר לשנות את העוגנים גם ב״קורסים נבחרים״ שבחלופות המערכת בתחתית העמוד.</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setShowAnchorsHelp(false)}
                          className="grid size-6 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-warning/15 hover:text-foreground"
                          aria-label="הסתרת הודעת עוגנים לחישוב"
                        >
                          <X className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>הסתרה</TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}
                {showScheduleOptionsHelp ? (
                  <div className="flex gap-2 border border-success/30 bg-success/10 px-3 py-2.5 text-right text-xs leading-5 text-foreground">
                    <CalendarDays className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    <p className="min-w-0 flex-1"><strong>אפשרויות למערכת מוכנה:</strong> לאחר יצירת חלופה, מתחת ללוח מערכת השעות בתחתית העמוד נמצא אזור למציאת קורסי כללי, בחירה או ספורט שמתאימים לחלופה המוצגת ושומרים על ימי החופש.</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setShowScheduleOptionsHelp(false)}
                          className="grid size-6 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-success/15 hover:text-foreground"
                          aria-label="הסתרת הודעת אפשרויות למערכת מוכנה"
                        >
                          <X className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>הסתרה</TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {canBrowseOfferings ? (
                  <div className="sticky top-0 z-20 -mx-4 space-y-3 border-b bg-card px-4 py-3 shadow-sm">
                    <Tabs
                      value={activeCourseType}
                      onValueChange={(value) => {
                        setActiveCourseType(value);
                        setActiveElectiveCluster("all");
                      }}
                    >
                      <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                        {courseTypeTabs.map((tab) => (
                          <TabsTrigger key={tab.value} value={tab.value} className="gap-1 px-2.5">
                            <span>{tab.label}</span>
                            <span className="font-mono text-[0.7rem] text-muted-foreground">{tab.count}</span>
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    {activeCourseType === "type:elective" && electiveClusterTabs.length > 1 ? (
                      <Tabs value={effectiveElectiveCluster} onValueChange={setActiveElectiveCluster}>
                        <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1 bg-muted/45 p-1">
                          {electiveClusterTabs.map((tab) => (
                            <TabsTrigger key={tab.value} value={tab.value} className="h-8 gap-1 px-2.5">
                              <span>{tab.label}</span>
                              <span className="font-mono text-[0.7rem] text-muted-foreground">{tab.count}</span>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    ) : null}
                    <label className="relative block">
                      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={courseQuery}
                        onChange={(event) => setCourseQuery(event.target.value)}
                        placeholder="חיפוש לפי שם או מספר קורס"
                        className="h-10 ps-9"
                        aria-label="חיפוש קורס"
                      />
                    </label>
                  </div>
                ) : null}
                {loading ? <div className="py-12 text-center text-sm text-muted-foreground">טוען היצע קורסים...</div> : null}
                {!loading && !canBrowseOfferings ? (
                  <div className="flex min-h-52 items-center justify-center border border-primary/30 bg-primary/5 px-6 text-center">
                    <div className="max-w-sm space-y-2">
                      <CalendarDays className="mx-auto size-7 text-primary" aria-hidden="true" />
                      <p className="text-base font-semibold">בחרו סמסטר בתואר</p>
                      <p className="text-sm leading-6 text-muted-foreground">לאחר הבחירה יוצגו הקורסים שאפשר לשלב במערכת.</p>
                    </div>
                  </div>
                ) : null}
                {!loading && canBrowseOfferings ? (
                  <div className="space-y-4 pt-4">
                    {visibleOfferings.length ? (
                      <div className="space-y-4">
                        {visibleOfferingGroups.map((group) => (
                          <section key={group.key} className="overflow-hidden rounded-lg border">
                            {group.label ? (
                              <div className="border-b bg-muted/45 px-4 py-2.5">
                                <span className="text-sm font-medium">{group.label}</span>
                              </div>
                            ) : null}
                            {group.offerings.map((offering) => (
                              <CourseAvailabilityRow
                                key={offering.course.id}
                                offering={offering}
                                audit={auditByCourseId.get(offering.course.id)}
                                selected={selectedCourseIds.includes(offering.course.id)}
                                selectionLocked={selectionLocked}
                                manualSelection={selectionMode === "manual"}
                                onToggle={toggleCourse}
                              />
                            ))}
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-dashed py-12 text-center text-sm text-muted-foreground">
                        אין קורסים עם קבוצה מתוזמנת בקבוצה שנבחרה.
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </section>

          <aside
            className="min-h-0 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[var(--timetable-panel-height)] lg:self-start"
            dir="rtl"
          >
            <Card className="h-full min-h-0">
              <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
                {selectedOfferings.length ? (
                  <>
                    <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 border-b bg-card px-4 py-2.5 shadow-sm">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">קורסים נבחרים</span>
                        <Badge variant="outline">{selectedOfferings.length}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatCredits(selectedOfferings.reduce((total, offering) => total + (offering.course.credits ?? 0), 0))} נ״ז
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="xs" onClick={expandAllSelectedCourses}>הרחב הכל</Button>
                        <Button type="button" variant="ghost" size="xs" onClick={collapseAllSelectedCourses}>צמצם הכל</Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                    {selectedOfferings.map((offering) => {
                      const editing = editingCourseIds.includes(offering.course.id);
                      const activeInVisualEditor = interactiveCourseId === offering.course.id;

                      return (
                        <section
                          key={offering.course.id}
                          className={cn(
                            "overflow-hidden border border-border border-s-[3px] border-s-(--course-accent) bg-background",
                            courseInk(offering.course.id)
                          )}
                        >
                          <div className="flex items-start gap-2 px-3 py-2.5">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-medium">{canonicalCourseName(offering)}</span>
                                {activeInVisualEditor ? <Badge variant="secondary">בלוח</Badge> : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="bg-(--course-surface) px-1.5 py-px font-mono text-xs text-(--course-ink)">
                                  {offering.course.id}
                                </span>
                                {offering.course.credits ? (
                                  <span className="font-mono text-xs text-muted-foreground">{formatCredits(offering.course.credits)} נ״ז</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={editing ? `סגירת עריכת ${canonicalCourseName(offering)}` : `עריכת ${canonicalCourseName(offering)}`}
                                    onClick={() => toggleCourseEditor(offering.course.id)}
                                  >
                                    {editing ? <ChevronUp /> : <ListFilter />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{editing ? "סגירת קבוצות" : "עריכת קבוצות"}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`הסרת ${canonicalCourseName(offering)}`}
                                    onClick={() => toggleCourse(offering.course.id, false)}
                                  >
                                    <X />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>הסרת קורס</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                          {editing ? (
                            <SectionPicker
                              offering={offering}
                              selections={displayedSectionSelections[offering.course.id]}
                              anchorSelections={anchorSelections[offering.course.id]}
                              showCurrentSelection={hasGeneratedSchedule}
                              disabled={false}
                              interactive={Boolean(interactiveSchedule)}
                              onToggleSection={(sectionType, sectionId, checked) =>
                                toggleSection(offering.course.id, sectionType, sectionId, checked)
                              }
                              onToggleAnchor={(sectionType, sectionId, checked) =>
                                toggleAnchor(offering.course.id, sectionType, sectionId, checked)
                              }
                              onResetSectionType={(sectionType) => resetSectionType(offering.course.id, sectionType)}
                            />
                          ) : null}
                        </section>
                      );
                    })}
                    </div>
                  </>
                ) : null}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {generated?.blockedCourseIds.length ? (
                  <p className="flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />קורסים חסומים הוסרו מהחיפוש.</p>
                ) : null}
                {generated?.notOfferedCourseIds.length ? (
                  <p className="text-sm text-muted-foreground">לקורסים מסוימים אין קבוצה עם שעה מפורסמת.</p>
                ) : null}
                {generated?.coursesWithoutBundles.length ? (
                  <p className="text-sm text-muted-foreground">לא נמצא שילוב קבוצות תקין לכל הקורסים שנבחרו.</p>
                ) : null}
                {generated && !generated.schedules.length && !generated.coursesWithoutBundles.length ? (
                  <p className="text-sm text-muted-foreground">לא נמצאה חלופה תקינה. נסו לשנות קורסים נבחרים או קבוצות עוגן.</p>
                ) : null}
              </CardContent>
              <CardFooter className="z-10 flex-col items-stretch gap-3 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
                <div className="border-b pb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">ימים חופשיים</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="הסבר על בחירת ימים חופשיים"
                        >
                          <CircleHelp className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64 text-right leading-5">
                        סמנו ימים שתרצו להשאיר פנויים משיעורים — החלופות ייתנו להם עדיפות.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {WEEK_DAYS.map((day) => {
                      const pressed = preferredFreeDayIndices.includes(day.index);

                      return (
                        <button
                          key={day.index}
                          type="button"
                          aria-pressed={pressed}
                          aria-label={`יום ${day.label} יום חופש`}
                          onClick={() => togglePreferredFreeDay(day.index, !pressed)}
                          className={cn(
                            "min-w-9 border px-2 py-1 text-center font-mono text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            pressed
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          )}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button className="w-full" disabled={!selectedCourseIds.length || generating} onClick={generate}>
                  <Play />{generating ? "מחשב חלופות..." : interactiveSchedule || generated ? "רענון חלופות" : "יצירת חלופות"}
                </Button>
              </CardFooter>
            </Card>
          </aside>

          {generated?.schedules.length ? (
            <section ref={alternativesSectionRef} className="scroll-mt-4 lg:col-start-1 lg:row-start-2" dir="rtl">
              <Card>
                <CardHeader>
                  <CardTitle>מערכות אפשריות</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3">
                    <Tabs value={resolvedAlternativeOverlapTab} onValueChange={(value) => selectAlternativeOverlapTab(value as AlternativeOverlapTab)}>
                      <TabsList className="h-auto w-full gap-1 bg-muted/45 p-1">
                        <TabsTrigger value="no-overlaps" className="flex-1 gap-1 px-2">
                          ללא חפיפה <span className="font-mono text-[0.7rem] text-muted-foreground">{alternativeEntries.filter(({ schedule }) => schedule.overlapMinutes === 0).length}</span>
                        </TabsTrigger>
                        <TabsTrigger value="with-overlaps" className="flex-1 gap-1 px-2">
                          עם חפיפה <span className="font-mono text-[0.7rem] text-muted-foreground">{alternativeEntries.filter(({ schedule }) => schedule.overlapMinutes > 0).length}</span>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {availableAlternativeFreeDayCounts.length ? (
                      <Tabs value={String(resolvedAlternativeFreeDayCount)} onValueChange={(value) => selectAlternativeFreeDayCount(Number(value))}>
                        <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                          {availableAlternativeFreeDayCounts.map((freeDayCount) => (
                            <TabsTrigger key={freeDayCount} value={String(freeDayCount)} className="gap-1 px-2.5">
                              <span>{freeDayCount} ימי חופש</span>
                              <span className="font-mono text-[0.7rem] text-muted-foreground">
                                {overlapFilteredAlternatives.filter(({ schedule }) => schedule.freeDayCount === freeDayCount).length}
                              </span>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    ) : null}
                    {displayedAlternativeSchedule ? (
                      <>
                        <label className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">חלופה מוצגת</span>
                          <select
                            value={String(resolvedActiveScheduleIndex)}
                            onChange={(event) => {
                              setActiveScheduleIndex(Number(event.target.value));
                              setInteractiveSchedule(null);
                              setInteractiveCourseId(null);
                            }}
                            className="h-9 min-w-52 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            aria-label="בחירת חלופה"
                          >
                            {displayedAlternativeEntries.map(({ schedule, index }, alternativeIndex) => (
                              <option key={index} value={String(index)}>
                                חלופה {alternativeIndex + 1}{schedule.overlapMinutes ? ` · ${schedule.overlapMinutes} דק׳ חפיפה` : " · ללא חפיפה"}
                              </option>
                            ))}
                          </select>
                        </label>
                  {visualWarnings.length ? (
                    <div className="space-y-1.5 border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-foreground">
                      <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-warning" />אזהרות בניסוי חזותי</div>
                      {visualWarnings.map((warning) => <p key={warning} className="leading-5">{warning}</p>)}
                    </div>
                  ) : null}
                  <SchedulePreview
                    schedule={displayedAlternativeSchedule}
                    onSelectCourse={(courseId) => {
                      if (interactiveSchedule) {
                        setInteractiveCourseId(courseId);
                        setEditingCourseIds((current) =>
                          current.includes(courseId) ? current : [...current, courseId]
                        );
                      } else {
                        startInteractiveEditing(displayedAlternativeSchedule, courseId);
                      }
                    }}
                  />
                  <ScheduleExamDates schedule={displayedAlternativeSchedule} offerings={offerings} />
                  <section className="space-y-4 border-t pt-5" dir="rtl">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <h3 className="text-base font-medium">אפשרויות שמתאימות למערכת המוצגת</h3>
                        <p className="text-xs leading-5 text-muted-foreground">מצאו קורסים שניתן לשלב בחלופה בלי לפגוע בימי החופש. בחירה באפשרות מעדכנת את המערכת המוצגת לבדיקה מיידית.</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={onlyExistingDays}
                          onCheckedChange={(checked) => setOnlyExistingDays(checked === true)}
                        />
                        <span>שמירה על ימי החופש</span>
                      </label>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="סוגי קורסים לחיפוש">
                        {ADDITION_COURSE_TYPE_OPTIONS.map((courseType) => (
                          <label key={courseType.value} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={additionCourseTypes.includes(courseType.value)}
                              onCheckedChange={(checked) => toggleAdditionCourseType(courseType.value, checked === true)}
                            />
                            <span>{courseType.label}</span>
                          </label>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={suggesting || !additionCourseTypes.length}
                        onClick={findSuggestedAdditions}
                      >
                        <RefreshCw />{suggesting ? "מחפש אפשרויות..." : "חיפוש אפשרויות"}
                      </Button>
                    </div>
                    {!additionCourseTypes.length ? <p className="text-sm text-muted-foreground">בחרו לפחות סוג קורס אחד לחיפוש.</p> : null}
                    {suggestionsError ? <p className="text-sm text-destructive">{suggestionsError}</p> : null}
                    {suggestions.length ? (
                      <div className="grid gap-2 lg:grid-cols-2">
                        {suggestions.map((suggestion) => {
                          const selected = Boolean(
                            interactiveSchedule && scheduleIncludesCourseIds(interactiveSchedule, suggestion.addedCourseIds)
                          );

                          return (
                            <button
                              key={`${suggestion.addedCourseIds.join("-")}:${suggestion.schedule.bundles.map((bundle) => bundle.sections.map((section) => section.id).join("-")).join("_")}`}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleSuggestedAddition(suggestion)}
                              className={cn(
                                "border border-border bg-background px-3 py-3 text-right transition-colors hover:bg-muted/45",
                                selected && "border-primary bg-primary/10"
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2 font-medium">
                                <span>{suggestion.addedCourseNames.join(" + ")}</span>
                                {selected ? <Badge variant="secondary">נבחר</Badge> : null}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                                <span>{suggestion.addedDayCount ? `+${suggestion.addedDayCount} ימי לימוד` : "ללא יום חדש"}</span>
                                <span>·</span>
                                <span>{suggestion.schedule.overlapMinutes ? `${suggestion.schedule.overlapMinutes} דק׳ חפיפה` : "ללא חפיפות"}</span>
                                <span>·</span>
                                <span>{suggestion.schedule.freeDayCount} ימי חופש</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                      </>
                    ) : (
                      <p className="border border-muted-foreground/25 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                        {resolvedAlternativeOverlapTab === "no-overlaps"
                          ? "אין חלופות ללא חפיפה עבור הבחירה הנוכחית."
                          : "אין חלופות עם חפיפה עבור הבחירה הנוכחית."}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </main>
      </div>
    </TooltipProvider>
  );
}
