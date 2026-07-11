import { NextResponse } from "next/server";

import { getDegreePlan } from "@/lib/db/degree-repository";
import { getProgramCourseOfferings } from "@/lib/db/yedion-repository";
import { createDegreeAudit } from "@/lib/degree-audit";
import { generateTimetables } from "@/lib/timetable-generator";
import type { SectionSelections, TimetablePreference } from "@/types/timetable";

type TimetableRequest = {
  completedCourseIds?: unknown;
  courseIds?: unknown;
  semester?: unknown;
  maxSchedules?: unknown;
  sectionSelections?: unknown;
  enforcePrerequisites?: unknown;
  preference?: unknown;
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

function sectionSelections(value: unknown, allowedCourseIds: Set<string>): SectionSelections {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const selections: SectionSelections = {};
  for (const [courseId, bySectionType] of Object.entries(value)) {
    if (!allowedCourseIds.has(courseId) || !bySectionType || typeof bySectionType !== "object" || Array.isArray(bySectionType)) {
      continue;
    }

    const courseSelections: Record<string, number[]> = {};
    for (const [sectionType, sectionIds] of Object.entries(bySectionType)) {
      if (!Array.isArray(sectionIds)) continue;
      const normalizedIds = [
        ...new Set(sectionIds.filter((sectionId): sectionId is number => typeof sectionId === "number" && Number.isInteger(sectionId))),
      ];
      courseSelections[sectionType] = normalizedIds;
    }
    if (Object.keys(courseSelections).length) selections[courseId] = courseSelections;
  }

  return selections;
}

function timetablePreference(value: unknown): TimetablePreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_PREFERENCE;

  const candidate = value as Record<string, unknown>;
  const strategy = candidate.strategy;
  const minimumFreeDays = candidate.minimumFreeDays;
  const preferredFreeDayIndices = Array.isArray(candidate.preferredFreeDayIndices)
    ? [...new Set(candidate.preferredFreeDayIndices.filter((dayIndex): dayIndex is number => typeof dayIndex === "number" && Number.isInteger(dayIndex) && dayIndex >= 1 && dayIndex <= 6))]
    : [];

  return {
    strategy:
      strategy === "least-overlap" || strategy === "no-overlaps"
        ? strategy
        : DEFAULT_PREFERENCE.strategy,
    minimumFreeDays:
      typeof minimumFreeDays === "number" && Number.isInteger(minimumFreeDays)
        ? Math.max(0, Math.min(minimumFreeDays, 6))
        : DEFAULT_PREFERENCE.minimumFreeDays,
    prioritizeFreeDays: candidate.prioritizeFreeDays === true,
    preferredFreeDayIndices,
  };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const programId = url.searchParams.get("programId") ?? undefined;
  const body = (await request.json().catch(() => ({}))) as TimetableRequest;
  const completedCourseIds = stringArray(body.completedCourseIds);
  const requestedCourseIds = stringArray(body.courseIds);
  const semester =
    typeof body.semester === "string" || typeof body.semester === "number" ? String(body.semester) : null;
  const maxSchedules =
    typeof body.maxSchedules === "number" && Number.isInteger(body.maxSchedules)
      ? Math.max(1, Math.min(body.maxSchedules, 74))
      : 74;
  const enforcePrerequisites = body.enforcePrerequisites !== false;
  const preference = timetablePreference(body.preference);

  try {
    const plan = getDegreePlan(programId);
    const planCourseIds = new Set(plan.courses.map((course) => course.id));
    const validRequestedIds = requestedCourseIds.filter((id) => planCourseIds.has(id));
    const selectedSections = sectionSelections(body.sectionSelections, new Set(validRequestedIds));
    if (validRequestedIds.length > 12) {
      return NextResponse.json(
        { error: "Choose up to twelve courses for one timetable search." },
        { status: 400 }
      );
    }
    if (!validRequestedIds.length) {
      return NextResponse.json({
        requestedCourseIds: [],
        blockedCourseIds: [],
        notOfferedCourseIds: [],
        coursesWithoutBundles: [],
        schedules: [],
      });
    }
    const audit = createDegreeAudit(completedCourseIds, plan);
    const auditByCourseId = new Map(audit.courseAudits.map((entry) => [entry.course.id, entry]));
    const blockedCourseIds = enforcePrerequisites
      ? validRequestedIds.filter((id) => !auditByCourseId.get(id)?.available)
      : [];
    const eligibleCourseIds = validRequestedIds.filter((id) => !blockedCourseIds.includes(id));
    const offerings = getProgramCourseOfferings(plan.id, { semester, courseIds: eligibleCourseIds });
    const notOfferedCourseIds = offerings.filter((offering) => !offering.schedulable).map((offering) => offering.course.id);
    const generatorInput = offerings.filter((offering) => offering.schedulable);
    const generated = generateTimetables(generatorInput, maxSchedules, selectedSections, preference);

    return NextResponse.json({
      requestedCourseIds: validRequestedIds,
      blockedCourseIds,
      notOfferedCourseIds,
      coursesWithoutBundles: generated.coursesWithoutBundles,
      schedules: generated.schedules,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate timetables." },
      { status: 400 }
    );
  }
}
