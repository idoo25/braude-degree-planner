import { NextResponse } from "next/server";

import { getDegreePlan } from "@/lib/db/degree-repository";
import { getProgramCourseOfferings } from "@/lib/db/yedion-repository";
import { createDegreeAudit } from "@/lib/degree-audit";
import { createGeneratedTimetable, suggestCourseAdditions } from "@/lib/timetable-generator";
import type { AdditionCourseType, GeneratedTimetable, TimetableBundle, TimetablePreference } from "@/types/timetable";

type SuggestionsRequest = {
  completedCourseIds?: unknown;
  semester?: unknown;
  enforcePrerequisites?: unknown;
  courseTypes?: unknown;
  preference?: unknown;
  baseSchedule?: unknown;
  onlyExistingDays?: unknown;
};

const DEFAULT_PREFERENCE: TimetablePreference = {
  strategy: "no-overlaps",
  minimumFreeDays: 0,
  prioritizeFreeDays: false,
  preferredFreeDayIndices: [],
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
}

function additionCourseTypes(value: unknown): AdditionCourseType[] {
  return stringArray(value).filter(
    (courseType): courseType is AdditionCourseType =>
      courseType === "general" || courseType === "elective" || courseType === "sport"
  );
}

function timetablePreference(value: unknown): TimetablePreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_PREFERENCE;

  const candidate = value as Record<string, unknown>;
  const preferredFreeDayIndices = Array.isArray(candidate.preferredFreeDayIndices)
    ? [...new Set(candidate.preferredFreeDayIndices.filter((dayIndex): dayIndex is number => typeof dayIndex === "number" && Number.isInteger(dayIndex) && dayIndex >= 1 && dayIndex <= 6))]
    : [];
  return {
    strategy: candidate.strategy === "least-overlap" ? "least-overlap" : "no-overlaps",
    minimumFreeDays:
      typeof candidate.minimumFreeDays === "number" && Number.isInteger(candidate.minimumFreeDays)
        ? Math.max(0, Math.min(candidate.minimumFreeDays, 6))
        : 0,
    prioritizeFreeDays: candidate.prioritizeFreeDays === true,
    preferredFreeDayIndices,
  };
}

function baseSchedule(value: unknown): GeneratedTimetable | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const bundles = (value as { bundles?: unknown }).bundles;
  if (!Array.isArray(bundles)) return null;

  return createGeneratedTimetable(bundles as TimetableBundle[]);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SuggestionsRequest;
  const schedule = baseSchedule(body.baseSchedule);
  const courseTypes = additionCourseTypes(body.courseTypes);
  const semester = typeof body.semester === "string" || typeof body.semester === "number" ? String(body.semester) : null;
  const enforcePrerequisites = body.enforcePrerequisites !== false;

  if (!schedule) {
    return NextResponse.json({ error: "Choose a timetable before requesting additions." }, { status: 400 });
  }

  if (!courseTypes.length) {
    return NextResponse.json({ error: "Choose at least one course category." }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const plan = getDegreePlan(url.searchParams.get("programId") ?? undefined);
    const completedCourseIds = stringArray(body.completedCourseIds);
    const auditByCourseId = new Map(
      createDegreeAudit(completedCourseIds, plan).courseAudits.map((entry) => [entry.course.id, entry])
    );
    const baseCourseIds = new Set(schedule.bundles.map((bundle) => bundle.courseId));
    const candidateOfferings = getProgramCourseOfferings(plan.id, { semester })
      .filter((offering) => offering.schedulable)
      .filter((offering) => !baseCourseIds.has(offering.course.id))
      .filter((offering) => courseTypes.includes(offering.course.type as AdditionCourseType))
      .filter((offering) => !enforcePrerequisites || Boolean(auditByCourseId.get(offering.course.id)?.available));

    const suggestions = suggestCourseAdditions(schedule, candidateOfferings, courseTypes, timetablePreference(body.preference));

    return NextResponse.json({
      suggestions: body.onlyExistingDays === true ? suggestions.filter((suggestion) => suggestion.addedDayCount === 0) : suggestions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not find course additions." },
      { status: 400 }
    );
  }
}
