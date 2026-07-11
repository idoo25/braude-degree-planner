import type {
  AdditionCourseType,
  CourseAdditionSuggestion,
  GeneratedTimetable,
  OfferingSection,
  ProgramCourseOffering,
  SectionSelections,
  TimetableBundle,
  TimetableMeeting,
  TimetablePreference,
} from "@/types/timetable";

const MAX_BUNDLES_PER_COURSE = 80;
const DEFAULT_MAX_SCHEDULES = 74;
const MAX_ADDITION_COMBINATIONS = 6000;
const MAX_TIMETABLE_CANDIDATES = 24000;
const MAX_NO_OVERLAP_ALTERNATIVES = 50;
const MAX_OVERLAP_ALTERNATIVES = 24;
const MIN_NO_OVERLAP_ALTERNATIVES_PER_FREE_DAY = 10;
const DEFAULT_PREFERENCE: TimetablePreference = {
  strategy: "no-overlaps",
  minimumFreeDays: 0,
  prioritizeFreeDays: false,
  preferredFreeDayIndices: [],
};

function meetingsOverlap(left: TimetableMeeting, right: TimetableMeeting) {
  return meetingOverlapMinutes(left, right) > 0;
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

function sectionsOverlap(left: OfferingSection, right: OfferingSection) {
  return left.meetings.some((leftMeeting) =>
    right.meetings.some((rightMeeting) => meetingsOverlap(leftMeeting, rightMeeting))
  );
}

function sectionsAreCompatible(sections: OfferingSection[]) {
  for (const section of sections) {
    const resolvedLinks = section.requiredSections.filter(
      (link) => link.resolutionStatus === "resolved" && link.requiredSectionId !== null
    );

    for (const other of sections) {
      if (section.id === other.id) continue;

      const linksForComponent = resolvedLinks.filter(
        (link) => link.requiredSectionType === other.sectionType
      );
      if (linksForComponent.length && !linksForComponent.some((link) => link.requiredSectionId === other.id)) {
        return false;
      }
    }
  }

  return true;
}

export function createCourseBundles(
  offering: ProgramCourseOffering,
  selectionsBySectionType: Record<string, number[]> = {}
): TimetableBundle[] {
  const componentTypes = [
    ...new Set(
      offering.sections
        .filter((section) => section.scheduleStatus === "scheduled" && !section.isBlockedForRegistration && section.meetings.length > 0)
        .map((section) => section.sectionType)
    ),
  ];
  const selectableSections = offering.sections.filter(
    (section) => {
      const selectedSectionIds = selectionsBySectionType[section.sectionType];
      const isManuallyConstrained = Array.isArray(selectedSectionIds);

      return (
        section.scheduleStatus === "scheduled" &&
        !section.isBlockedForRegistration &&
        section.meetings.length > 0 &&
        (!isManuallyConstrained || selectedSectionIds.includes(section.id))
      );
    }
  );
  const sectionsByType = new Map<string, OfferingSection[]>();
  for (const sectionType of componentTypes) {
    sectionsByType.set(sectionType, []);
  }
  for (const section of selectableSections) {
    const current = sectionsByType.get(section.sectionType) ?? [];
    current.push(section);
    sectionsByType.set(section.sectionType, current);
  }

  const sortedComponentTypes = componentTypes.sort((left, right) => {
    const sizeDifference = (sectionsByType.get(left)?.length ?? 0) - (sectionsByType.get(right)?.length ?? 0);
    return sizeDifference || left.localeCompare(right, "he");
  });
  if (!sortedComponentTypes.length || sortedComponentTypes.some((sectionType) => !(sectionsByType.get(sectionType)?.length))) {
    return [];
  }

  const bundles: TimetableBundle[] = [];
  const selected: OfferingSection[] = [];

  function search(componentIndex: number) {
    if (bundles.length >= MAX_BUNDLES_PER_COURSE) return;
    if (componentIndex === sortedComponentTypes.length) {
      bundles.push({
        courseId: offering.course.id,
        courseName: offering.yedionCourseName ?? offering.course.name,
        sections: [...selected],
      });
      return;
    }

    for (const candidate of sectionsByType.get(sortedComponentTypes[componentIndex]) ?? []) {
      if (selected.some((section) => sectionsOverlap(section, candidate))) continue;
      selected.push(candidate);
      if (sectionsAreCompatible(selected)) {
        search(componentIndex + 1);
      }
      selected.pop();
    }
  }

  search(0);
  return bundles;
}

/*
  Performance note: everything below runs client-side, in the user's browser, over a
  search space that can exceed 10^9 combinations. The costly work is therefore done
  incrementally: bundles get their meetings flattened once (WeakMap cache), the DFS
  maintains running overlap/day/meeting totals with O(bundle × prefix) deltas instead
  of re-measuring the whole prefix from scratch, and diversification caches each
  schedule's per-course signature so the farthest-point loop is a linear array walk.
*/

const bundleMeetingsCache = new WeakMap<TimetableBundle, TimetableMeeting[]>();

function bundleMeetings(bundle: TimetableBundle): TimetableMeeting[] {
  let meetings = bundleMeetingsCache.get(bundle);
  if (!meetings) {
    meetings = bundle.sections.flatMap((section) => section.meetings);
    bundleMeetingsCache.set(bundle, meetings);
  }
  return meetings;
}

function bundleDayIndices(bundle: TimetableBundle): number[] {
  return bundleMeetings(bundle)
    .map((meeting) => meeting.dayIndex)
    .filter((dayIndex): dayIndex is number => dayIndex !== null && dayIndex >= 1 && dayIndex <= 6);
}

function measureSchedule(bundles: TimetableBundle[]) {
  const meetings = bundles.flatMap((bundle) =>
    bundleMeetings(bundle).map((meeting) => ({
      courseId: bundle.courseId,
      meeting,
    }))
  );
  const overlappingCourseIds = new Set<string>();
  let overlapMinutes = 0;

  for (let leftIndex = 0; leftIndex < meetings.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < meetings.length; rightIndex += 1) {
      const left = meetings[leftIndex];
      const right = meetings[rightIndex];
      if (left.courseId === right.courseId) continue;

      const overlap = meetingOverlapMinutes(left.meeting, right.meeting);
      if (!overlap) continue;

      overlapMinutes += overlap;
      overlappingCourseIds.add(left.courseId);
      overlappingCourseIds.add(right.courseId);
    }
  }

  const usedDays = new Set(
    meetings
      .map((entry) => entry.meeting.dayIndex)
      .filter((dayIndex): dayIndex is number => dayIndex !== null && dayIndex >= 1 && dayIndex <= 6)
  );

  return {
    meetingCount: meetings.length,
    overlapMinutes,
    overlappingCourseCount: overlappingCourseIds.size,
    freeDayCount: 6 - usedDays.size,
  };
}

export function createGeneratedTimetable(bundles: TimetableBundle[]): GeneratedTimetable {
  return {
    bundles,
    ...measureSchedule(bundles),
  };
}

function compareSchedules(
  left: GeneratedTimetable,
  right: GeneratedTimetable,
  preference: TimetablePreference
) {
  const leftPreferredDayConflicts = preferredFreeDayConflicts(left, preference);
  const rightPreferredDayConflicts = preferredFreeDayConflicts(right, preference);
  if (leftPreferredDayConflicts !== rightPreferredDayConflicts) {
    return leftPreferredDayConflicts - rightPreferredDayConflicts;
  }

  const leftMeetsTarget = left.freeDayCount >= preference.minimumFreeDays ? 0 : 1;
  const rightMeetsTarget = right.freeDayCount >= preference.minimumFreeDays ? 0 : 1;
  if (leftMeetsTarget !== rightMeetsTarget) return leftMeetsTarget - rightMeetsTarget;

  if (preference.prioritizeFreeDays) {
    return (
      right.freeDayCount - left.freeDayCount ||
      left.overlapMinutes - right.overlapMinutes ||
      left.overlappingCourseCount - right.overlappingCourseCount ||
      left.meetingCount - right.meetingCount
    );
  }

  return (
    left.overlapMinutes - right.overlapMinutes ||
    left.overlappingCourseCount - right.overlappingCourseCount ||
    right.freeDayCount - left.freeDayCount ||
    left.meetingCount - right.meetingCount
  );
}

const signatureArrayCache = new WeakMap<GeneratedTimetable, string[]>();
const signatureStringCache = new WeakMap<GeneratedTimetable, string>();

function scheduleSignatureArray(schedule: GeneratedTimetable): string[] {
  let signature = signatureArrayCache.get(schedule);
  if (!signature) {
    signature = schedule.bundles
      .map((bundle) => `${bundle.courseId}:${bundle.sections.map((section) => `${section.sectionType}:${section.id}`).sort().join("|")}`)
      .sort();
    signatureArrayCache.set(schedule, signature);
  }
  return signature;
}

function scheduleVariationSignature(schedule: GeneratedTimetable) {
  let signature = signatureStringCache.get(schedule);
  if (!signature) {
    signature = scheduleSignatureArray(schedule).join(";");
    signatureStringCache.set(schedule, signature);
  }
  return signature;
}

function scheduleVariationDistance(left: GeneratedTimetable, right: GeneratedTimetable) {
  const leftSignature = scheduleSignatureArray(left);
  const rightSignature = scheduleSignatureArray(right);

  // Both arrays are sorted, and each entry is prefixed by its course id — a merge
  // walk counts per-course differences without building Maps per call.
  let leftIndex = 0;
  let rightIndex = 0;
  let distance = 0;

  while (leftIndex < leftSignature.length && rightIndex < rightSignature.length) {
    const leftEntry = leftSignature[leftIndex];
    const rightEntry = rightSignature[rightIndex];

    if (leftEntry === rightEntry) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    distance += 1;
    if (leftEntry < rightEntry) leftIndex += 1;
    else rightIndex += 1;
  }

  return distance + (leftSignature.length - leftIndex) + (rightSignature.length - rightIndex);
}

function diversifySchedules(
  schedules: GeneratedTimetable[],
  limit: number,
  preference: TimetablePreference
) {
  if (!limit || !schedules.length) return [];
  if (schedules.length <= limit) return [...schedules];

  const ranked = [...schedules].sort((left, right) => compareSchedules(left, right, preference));
  const pool = ranked.slice(0, limit * 80);
  const selected = [pool.shift()!];
  // Farthest-point selection with an incrementally-maintained minimum distance per
  // candidate: each pick only measures candidates against the newest selection,
  // instead of re-measuring against every previous selection.
  const minimumDistances = pool.map((candidate) => scheduleVariationDistance(candidate, selected[0]));

  while (selected.length < limit && pool.length) {
    let bestIndex = 0;

    for (let index = 1; index < pool.length; index += 1) {
      const candidateDistance = minimumDistances[index];
      const bestDistance = minimumDistances[bestIndex];
      if (candidateDistance < bestDistance) continue;
      if (candidateDistance > bestDistance) {
        bestIndex = index;
        continue;
      }

      const rankOrder = compareSchedules(pool[index], pool[bestIndex], preference);
      if (
        rankOrder < 0 ||
        (rankOrder === 0 &&
          scheduleVariationSignature(pool[index]).localeCompare(scheduleVariationSignature(pool[bestIndex])) < 0)
      ) {
        bestIndex = index;
      }
    }

    const picked = pool.splice(bestIndex, 1)[0];
    minimumDistances.splice(bestIndex, 1);
    selected.push(picked);

    for (let index = 0; index < pool.length; index += 1) {
      const distanceToPicked = scheduleVariationDistance(pool[index], picked);
      if (distanceToPicked < minimumDistances[index]) {
        minimumDistances[index] = distanceToPicked;
      }
    }
  }

  return selected;
}

function diversifyMinimalOverlapSchedules(
  schedules: GeneratedTimetable[],
  limit: number,
  preference: TimetablePreference
) {
  if (!limit || !schedules.length) return [];

  const rankedByOverlap = [...schedules].sort(
    (left, right) =>
      left.overlapMinutes - right.overlapMinutes ||
      left.overlappingCourseCount - right.overlappingCourseCount ||
      compareSchedules(left, right, preference)
  );
  const overlapCeiling = rankedByOverlap[Math.min(limit, rankedByOverlap.length) - 1].overlapMinutes;

  // Keep every option needed to reach the requested count at the smallest
  // possible overlap, then diversify only inside that minimal-overlap pool.
  return diversifySchedules(
    rankedByOverlap.filter((schedule) => schedule.overlapMinutes <= overlapCeiling),
    limit,
    preference
  );
}

function diversifyNoOverlapSchedulesByFreeDays(
  schedules: GeneratedTimetable[],
  limit: number,
  preference: TimetablePreference
) {
  if (!limit || !schedules.length) return [];

  const schedulesByFreeDayCount = new Map<number, GeneratedTimetable[]>();
  for (const schedule of schedules) {
    const current = schedulesByFreeDayCount.get(schedule.freeDayCount) ?? [];
    current.push(schedule);
    schedulesByFreeDayCount.set(schedule.freeDayCount, current);
  }

  const buckets = [...schedulesByFreeDayCount.entries()].sort(([left], [right]) => right - left);
  const baselinePerBucket = buckets.length * MIN_NO_OVERLAP_ALTERNATIVES_PER_FREE_DAY <= limit
    ? MIN_NO_OVERLAP_ALTERNATIVES_PER_FREE_DAY
    : Math.floor(limit / buckets.length);
  const selected: GeneratedTimetable[] = [];
  const selectedSignatures = new Set<string>();

  for (const [, candidates] of buckets) {
    const bucketTarget = Math.min(baselinePerBucket, candidates.length, limit - selected.length);
    const bucketSchedules = diversifySchedules(candidates, bucketTarget, preference);
    for (const schedule of bucketSchedules) {
      selected.push(schedule);
      selectedSignatures.add(scheduleVariationSignature(schedule));
    }
  }

  // After every visible free-day bucket has a fair baseline, use the remaining
  // room for additional distinct options without hiding a valid tab.
  const remainingCandidates = schedules.filter(
    (schedule) => !selectedSignatures.has(scheduleVariationSignature(schedule))
  );
  return [
    ...selected,
    ...diversifySchedules(remainingCandidates, limit - selected.length, preference),
  ];
}

const scheduleDaysCache = new WeakMap<GeneratedTimetable, Set<number>>();

function preferredFreeDayConflicts(schedule: GeneratedTimetable, preference: TimetablePreference) {
  if (!preference.preferredFreeDayIndices.length) return 0;

  const usedDays = scheduleDayIndices(schedule);
  return preference.preferredFreeDayIndices.filter((dayIndex) => usedDays.has(dayIndex)).length;
}

function scheduleDayIndices(schedule: GeneratedTimetable) {
  let usedDays = scheduleDaysCache.get(schedule);
  if (!usedDays) {
    usedDays = new Set(
      schedule.bundles
        .flatMap((bundle) => bundle.sections)
        .flatMap((section) => section.meetings)
        .map((meeting) => meeting.dayIndex)
        .filter((dayIndex): dayIndex is number => dayIndex !== null && dayIndex >= 1 && dayIndex <= 6)
    );
    scheduleDaysCache.set(schedule, usedDays);
  }
  return usedDays;
}

type CandidateBundle = {
  bundle: TimetableBundle;
  schedule: GeneratedTimetable;
};

function candidateBundlesForOffering(
  offering: ProgramCourseOffering,
  baseSchedule: GeneratedTimetable,
  preference: TimetablePreference
): CandidateBundle[] {
  return createCourseBundles(offering)
    .map((bundle) => ({
      bundle,
      schedule: createGeneratedTimetable([...baseSchedule.bundles, bundle]),
    }))
    .sort((left, right) => compareSchedules(left.schedule, right.schedule, preference))
    .slice(0, 8);
}

function createAdditionSuggestion(
  baseSchedule: GeneratedTimetable,
  bundles: TimetableBundle[]
): CourseAdditionSuggestion {
  const schedule = createGeneratedTimetable([...baseSchedule.bundles, ...bundles]);
  const baseDays = scheduleDayIndices(baseSchedule);
  const addedDays = scheduleDayIndices(schedule);

  return {
    addedCourseIds: bundles.map((bundle) => bundle.courseId),
    addedCourseNames: bundles.map((bundle) => bundle.courseName),
    addedDayCount: [...addedDays].filter((dayIndex) => !baseDays.has(dayIndex)).length,
    schedule,
  };
}

export function suggestCourseAdditions(
  baseSchedule: GeneratedTimetable,
  candidateOfferings: ProgramCourseOffering[],
  courseTypes: AdditionCourseType[],
  preference: TimetablePreference,
  limit = 8
): CourseAdditionSuggestion[] {
  const selectedTypes = [...new Set(courseTypes)];
  if (!selectedTypes.length) return [];

  const optionsByCourseId = new Map(
    candidateOfferings.map((offering) => [
      offering.course.id,
      candidateBundlesForOffering(offering, baseSchedule, preference),
    ])
  );

  const bundleOptionsByType = selectedTypes.map((courseType) =>
    candidateOfferings
      .filter((offering) => offering.course.type === courseType)
      .flatMap((offering) => (optionsByCourseId.get(offering.course.id) ?? []).map((option) => option.bundle))
  );

  if (bundleOptionsByType.some((bundles) => !bundles.length)) return [];

  let bundleCombinations: TimetableBundle[][] = [[]];
  for (const bundleOptions of bundleOptionsByType) {
    const nextCombinations: TimetableBundle[][] = [];
    // Spread the combination budget fairly across the existing partial combinations,
    // so a large later type (e.g. dozens of sport groups) cannot starve all but the
    // first couple of options of an earlier type.
    const quotaPerCombination = Math.max(1, Math.floor(MAX_ADDITION_COMBINATIONS / bundleCombinations.length));

    for (const combination of bundleCombinations) {
      let taken = 0;
      for (const bundle of bundleOptions) {
        if (taken >= quotaPerCombination || nextCombinations.length >= MAX_ADDITION_COMBINATIONS) break;
        nextCombinations.push([...combination, bundle]);
        taken += 1;
      }
      if (nextCombinations.length >= MAX_ADDITION_COMBINATIONS) break;
    }

    bundleCombinations = nextCombinations;
  }

  const suggestions = bundleCombinations.map((bundles) => createAdditionSuggestion(baseSchedule, bundles));

  const compatibleSuggestions =
    preference.strategy === "no-overlaps"
      ? suggestions.filter((suggestion) => suggestion.schedule.overlapMinutes === baseSchedule.overlapMinutes)
      : suggestions;

  return compatibleSuggestions
    .sort(
      (left, right) =>
        left.addedDayCount - right.addedDayCount ||
        compareSchedules(left.schedule, right.schedule, preference) ||
        left.addedCourseNames.join(" ").localeCompare(right.addedCourseNames.join(" "), "he")
    )
    .slice(0, limit);
}

type BundleDelta = {
  bundle: TimetableBundle;
  crossOverlapMinutes: number;
  newOverlappingIds: string[];
  bundleIsOverlapping: boolean;
  newDayIndices: number[];
  // Post-selection totals, used both to order siblings and to update the running
  // prefix state without recomputing anything.
  overlapMinutes: number;
  overlappingCourseCount: number;
  freeDayCount: number;
  meetingCount: number;
  preferredDayConflicts: number;
  meetsFreeDayTarget: number;
};

export function generateTimetables(
  offerings: ProgramCourseOffering[],
  maxSchedules = DEFAULT_MAX_SCHEDULES,
  sectionSelections: SectionSelections = {},
  preference: TimetablePreference = DEFAULT_PREFERENCE
): { schedules: GeneratedTimetable[]; coursesWithoutBundles: string[] } {
  const bundleOptions = offerings.map((offering) => ({
    courseId: offering.course.id,
    bundles: createCourseBundles(offering, sectionSelections[offering.course.id]),
  }));
  const coursesWithoutBundles = bundleOptions
    .filter((entry) => !entry.bundles.length)
    .map((entry) => entry.courseId);
  if (coursesWithoutBundles.length) {
    return { schedules: [], coursesWithoutBundles };
  }

  const sortedOptions = [...bundleOptions].sort((left, right) => left.bundles.length - right.bundles.length);
  const schedules: GeneratedTimetable[] = [];
  const selectedBundles: TimetableBundle[] = [];
  const maxCandidates = Math.min(MAX_TIMETABLE_CANDIDATES, maxSchedules * 500);
  const preferredDaySet = new Set(preference.preferredFreeDayIndices);

  // Running prefix state, maintained incrementally by the DFS: the flattened
  // meetings of every selected bundle, total cross-course overlap minutes, the set
  // of courses involved in any overlap, and per-day meeting counts.
  const prefixMeetings: { courseId: string; meeting: TimetableMeeting }[] = [];
  const overlappingIds = new Set<string>();
  const dayMeetingCounts = new Map<number, number>();
  let prefixOverlapMinutes = 0;
  let usedDayCount = 0;
  let preferredDayHits = 0;

  function computeBundleDelta(bundle: TimetableBundle): BundleDelta {
    const meetings = bundleMeetings(bundle);
    let crossOverlapMinutes = 0;
    const crossIds = new Set<string>();

    for (const meeting of meetings) {
      if (meeting.dayIndex === null || meeting.startMinutes === null || meeting.endMinutes === null) continue;
      for (const prefixEntry of prefixMeetings) {
        const overlap = meetingOverlapMinutes(meeting, prefixEntry.meeting);
        if (!overlap) continue;
        crossOverlapMinutes += overlap;
        crossIds.add(prefixEntry.courseId);
      }
    }

    const newOverlappingIds = [...crossIds].filter((courseId) => !overlappingIds.has(courseId));
    const bundleIsOverlapping = crossOverlapMinutes > 0 && !overlappingIds.has(bundle.courseId);
    const newDaySet = new Set<number>();
    let newPreferredHits = 0;
    for (const dayIndex of bundleDayIndices(bundle)) {
      if (!dayMeetingCounts.has(dayIndex) && !newDaySet.has(dayIndex)) {
        newDaySet.add(dayIndex);
        if (preferredDaySet.has(dayIndex)) newPreferredHits += 1;
      }
    }

    const freeDayCount = 6 - (usedDayCount + newDaySet.size);

    return {
      bundle,
      crossOverlapMinutes,
      newOverlappingIds,
      bundleIsOverlapping,
      newDayIndices: [...newDaySet],
      overlapMinutes: prefixOverlapMinutes + crossOverlapMinutes,
      overlappingCourseCount: overlappingIds.size + newOverlappingIds.length + (bundleIsOverlapping ? 1 : 0),
      freeDayCount,
      meetingCount: prefixMeetings.length + meetings.length,
      preferredDayConflicts: preferredDayHits + newPreferredHits,
      meetsFreeDayTarget: freeDayCount >= preference.minimumFreeDays ? 0 : 1,
    };
  }

  function compareDeltas(left: BundleDelta, right: BundleDelta) {
    if (left.preferredDayConflicts !== right.preferredDayConflicts) {
      return left.preferredDayConflicts - right.preferredDayConflicts;
    }
    if (left.meetsFreeDayTarget !== right.meetsFreeDayTarget) {
      return left.meetsFreeDayTarget - right.meetsFreeDayTarget;
    }

    if (preference.prioritizeFreeDays) {
      return (
        right.freeDayCount - left.freeDayCount ||
        left.overlapMinutes - right.overlapMinutes ||
        left.overlappingCourseCount - right.overlappingCourseCount ||
        left.meetingCount - right.meetingCount
      );
    }

    return (
      left.overlapMinutes - right.overlapMinutes ||
      left.overlappingCourseCount - right.overlappingCourseCount ||
      right.freeDayCount - left.freeDayCount ||
      left.meetingCount - right.meetingCount
    );
  }

  function pushDelta(delta: BundleDelta) {
    selectedBundles.push(delta.bundle);
    for (const meeting of bundleMeetings(delta.bundle)) {
      prefixMeetings.push({ courseId: delta.bundle.courseId, meeting });
    }
    prefixOverlapMinutes += delta.crossOverlapMinutes;
    for (const courseId of delta.newOverlappingIds) overlappingIds.add(courseId);
    if (delta.bundleIsOverlapping) overlappingIds.add(delta.bundle.courseId);
    for (const dayIndex of bundleDayIndices(delta.bundle)) {
      const current = dayMeetingCounts.get(dayIndex) ?? 0;
      if (current === 0) {
        usedDayCount += 1;
        if (preferredDaySet.has(dayIndex)) preferredDayHits += 1;
      }
      dayMeetingCounts.set(dayIndex, current + 1);
    }
  }

  function popDelta(delta: BundleDelta) {
    selectedBundles.pop();
    prefixMeetings.length -= bundleMeetings(delta.bundle).length;
    prefixOverlapMinutes -= delta.crossOverlapMinutes;
    for (const courseId of delta.newOverlappingIds) overlappingIds.delete(courseId);
    if (delta.bundleIsOverlapping) overlappingIds.delete(delta.bundle.courseId);
    for (const dayIndex of bundleDayIndices(delta.bundle)) {
      const current = (dayMeetingCounts.get(dayIndex) ?? 1) - 1;
      if (current === 0) {
        dayMeetingCounts.delete(dayIndex);
        usedDayCount -= 1;
        if (preferredDaySet.has(dayIndex)) preferredDayHits -= 1;
      } else {
        dayMeetingCounts.set(dayIndex, current);
      }
    }
  }

  // The candidate budget is split round-robin across sibling branches at every
  // level, so early courses vary across the result set instead of the whole budget
  // being spent inside the lexicographically-first branch. Better branches (by the
  // same ordering the final ranking uses) still get their share first, and unused
  // budget flows to later siblings.
  function search(courseIndex: number, budget: number): number {
    if (budget <= 0) return 0;
    if (courseIndex === sortedOptions.length) {
      schedules.push({
        bundles: [...selectedBundles],
        meetingCount: prefixMeetings.length,
        overlapMinutes: prefixOverlapMinutes,
        overlappingCourseCount: overlappingIds.size,
        freeDayCount: 6 - usedDayCount,
      });
      return 1;
    }

    const orderedDeltas = sortedOptions[courseIndex].bundles
      .map((bundle) => computeBundleDelta(bundle))
      .sort(compareDeltas);

    let remaining = budget;
    for (let index = 0; index < orderedDeltas.length && remaining > 0; index += 1) {
      const share = Math.max(1, Math.ceil(remaining / (orderedDeltas.length - index)));
      const delta = orderedDeltas[index];

      pushDelta(delta);
      remaining -= search(courseIndex + 1, Math.min(share, remaining));
      popDelta(delta);
    }

    return budget - remaining;
  }

  search(0, maxCandidates);
  const preferredDayCompatibleSchedules = preference.preferredFreeDayIndices.length
    ? schedules.filter((schedule) => preferredFreeDayConflicts(schedule, preference) === 0)
    : schedules;
  const alternativeCandidates = preferredDayCompatibleSchedules.length
    ? preferredDayCompatibleSchedules
    : schedules;
  const noOverlapCandidates = alternativeCandidates.filter((schedule) => schedule.overlapMinutes === 0);
  const overlapCandidates = alternativeCandidates.filter((schedule) => schedule.overlapMinutes > 0);
  const requestedSchedules = Math.max(
    1,
    Math.min(maxSchedules, MAX_NO_OVERLAP_ALTERNATIVES + MAX_OVERLAP_ALTERNATIVES)
  );
  const noOverlapTarget = Math.min(MAX_NO_OVERLAP_ALTERNATIVES, requestedSchedules);
  const overlapTarget = Math.min(
    MAX_OVERLAP_ALTERNATIVES,
    Math.max(0, requestedSchedules - noOverlapTarget)
  );
  const noOverlapSchedules = diversifyNoOverlapSchedulesByFreeDays(
    noOverlapCandidates,
    noOverlapTarget,
    preference
  );
  const overlapSchedules = diversifyMinimalOverlapSchedules(overlapCandidates, overlapTarget, preference);

  return {
    // Do not backfill one tab from the other: each tab stays truthful and can
    // gracefully show an empty state when that kind of timetable is impossible.
    schedules: [...noOverlapSchedules, ...overlapSchedules],
    coursesWithoutBundles: [],
  };
}
