import type {
  Course,
  CourseAudit,
  DegreeAudit,
  DegreePlan,
  DegreeRule,
  MissingPrerequisite,
  RequirementGap,
  RequirementGroup,
} from "@/types/degree";

const roundCredit = (value: number) => Math.round(value * 10) / 10;

export function getCourseMap(plan: DegreePlan) {
  return new Map(plan.courses.map((course) => [course.id, course]));
}

function getCourseLabel(courseId: string, courseMap: Map<string, Course>) {
  const course = courseMap.get(courseId);

  return course ? `${course.id} ${course.name}` : courseId;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getMissingPrerequisites(
  course: Course,
  selected: Set<string>,
  courseMap: Map<string, Course>
): MissingPrerequisite[] {
  return (course.prerequisites ?? []).flatMap((group) => {
    if (group.mode === "all") {
      const missingIds = group.ids.filter((id) => !selected.has(id));

      if (missingIds.length === 0) {
        return [];
      }

      return [
        {
          ids: missingIds,
          label: group.label ?? missingIds.map((id) => getCourseLabel(id, courseMap)).join(", "),
        },
      ];
    }

    const hasAny = group.ids.some((id) => selected.has(id));

    if (hasAny) {
      return [];
    }

    return [
      {
        ids: group.ids,
        label: group.label ?? group.ids.map((id) => getCourseLabel(id, courseMap)).join(" / "),
      },
    ];
  });
}

function getRequirementCourseIds(group: RequirementGroup, plan: DegreePlan) {
  if (group.courseIds?.length) {
    return group.courseIds;
  }

  return plan.courses
    .filter((course) => course.requirementGroup === group.code)
    .map((course) => course.id);
}

function getSelectedRequirementCourseIds(
  group: RequirementGroup,
  selected: Set<string>,
  plan: DegreePlan
) {
  return getRequirementCourseIds(group, plan).filter((id) => selected.has(id));
}

function isRequirementGroupSatisfied(group: RequirementGroup, selected: Set<string>, plan: DegreePlan) {
  const selectedIds = getSelectedRequirementCourseIds(group, selected, plan);

  if (group.kind === "alternative") {
    return selectedIds.length >= (group.minCourses ?? 1);
  }

  if (typeof group.requiredCredits === "number") {
    const courseMap = getCourseMap(plan);
    const selectedCredits = selectedIds.reduce((sum, id) => sum + (courseMap.get(id)?.credits ?? 0), 0);

    return selectedCredits >= group.requiredCredits;
  }

  return selectedIds.length >= (group.minCourses ?? 1);
}

function getRequirementGroupCredits(group: RequirementGroup, selected: Set<string>, plan: DegreePlan) {
  if (!isRequirementGroupSatisfied(group, selected, plan)) {
    return 0;
  }

  if (typeof group.requiredCredits === "number") {
    return group.requiredCredits;
  }

  const courseMap = getCourseMap(plan);

  return getSelectedRequirementCourseIds(group, selected, plan).reduce(
    (sum, id) => sum + (courseMap.get(id)?.credits ?? 0),
    0
  );
}

function createCourseAudits(
  selected: Set<string>,
  plan: DegreePlan,
  courseMap: Map<string, Course>
): CourseAudit[] {
  return plan.courses.map((course) => {
    const missingPrerequisites = getMissingPrerequisites(course, selected, courseMap);

    return {
      course,
      completed: selected.has(course.id),
      available: missingPrerequisites.length === 0,
      missingPrerequisites,
    };
  });
}

function createRequiredGaps(
  selected: Set<string>,
  plan: DegreePlan,
  courseMap: Map<string, Course>
): RequirementGap[] {
  const gaps: RequirementGap[] = plan.courses
    .filter((course) => course.required && !course.requirementGroup && !selected.has(course.id))
    .map((course) => ({
      id: course.id,
      label: `${course.id} ${course.name}`,
      credits: course.credits,
      courseIds: [course.id],
    }));

  plan.requirementGroups
    .filter((group) => !isRequirementGroupSatisfied(group, selected, plan))
    .forEach((group) => {
      gaps.push({
        id: group.code,
        label: group.name,
        credits: group.requiredCredits,
        courseIds: getRequirementCourseIds(group, plan),
      });
    });

  return gaps.sort((a, b) => {
    const aCourse = a.courseIds?.[0] ? courseMap.get(a.courseIds[0]) : undefined;
    const bCourse = b.courseIds?.[0] ? courseMap.get(b.courseIds[0]) : undefined;
    const aSemester = aCourse?.semester ?? 99;
    const bSemester = bCourse?.semester ?? 99;

    return aSemester - bSemester || a.label.localeCompare(b.label, "he");
  });
}

function createRuleWarnings(
  rules: DegreeRule[],
  selected: Set<string>,
  clusterAudits: DegreeAudit["clusterAudits"],
  plan: DegreePlan
) {
  const warnings: string[] = [];

  plan.requirementGroups
    .filter((group) => group.kind === "alternative")
    .forEach((group) => {
      const selectedIds = getSelectedRequirementCourseIds(group, selected, plan);
      const maxCourses = group.minCourses ?? 1;

      if (selectedIds.length > maxCourses) {
        warnings.push(`סומנו יותר מדי אפשרויות עבור ${group.name}; בדרך כלל נדרשות ${maxCourses}.`);
      }
    });

  rules
    .filter((rule) => rule.enabled)
    .forEach((rule) => {
      if (rule.type === "mutual_exclusion") {
        const courseIds = getStringArray(rule.payload.courseIds);
        const maxSelected =
          typeof rule.payload.maxSelected === "number" ? rule.payload.maxSelected : 1;
        const selectedIds = courseIds.filter((id) => selected.has(id));

        if (selectedIds.length > maxSelected) {
          warnings.push(rule.message);
        }
      }

      if (rule.type === "conversion_requires_cluster") {
        const conversionCourseIds = getStringArray(rule.payload.conversionCourseIds);
        const clusterId = typeof rule.payload.clusterId === "string" ? rule.payload.clusterId : "";
        const hasConversion = conversionCourseIds.some((id) => selected.has(id));
        const clusterSatisfied = clusterAudits.find((cluster) => cluster.id === clusterId)?.satisfied;

        if (hasConversion && clusterSatisfied === false) {
          warnings.push(rule.message);
        }
      }
    });

  return [...new Set(warnings)];
}

export function createDegreeAudit(selectedCourseIds: string[], plan: DegreePlan): DegreeAudit {
  const courseMap = getCourseMap(plan);
  const selected = new Set(selectedCourseIds.filter((id) => courseMap.has(id)));
  const selectedCourses = [...selected].map((id) => courseMap.get(id)).filter(Boolean) as Course[];
  const courseAudits = createCourseAudits(selected, plan, courseMap);
  const generalCreditsFromCourses = selectedCourses
    .filter((course) => course.type === "general")
    .reduce((sum, course) => sum + course.credits, 0);
  const conversionCredits = selectedCourses
    .filter((course) => course.type === "conversion")
    .reduce((sum, course) => sum + course.credits, 0);
  const conversionCreditsAppliedToGeneral = Math.min(
    conversionCredits,
    Math.max(0, plan.requirements.generalCredits - generalCreditsFromCourses)
  );
  const generalCreditsCompleted = Math.min(
    plan.requirements.generalCredits,
    generalCreditsFromCourses + conversionCreditsAppliedToGeneral
  );
  const electiveConversionCredits = Math.max(0, conversionCredits - conversionCreditsAppliedToGeneral);
  const electiveCreditsCompleted = selectedCourses
    .filter((course) => course.type === "elective")
    .reduce((sum, course) => sum + course.credits, electiveConversionCredits);
  const fixedMandatoryCredits = selectedCourses
    .filter((course) => course.required && !course.requirementGroup)
    .reduce((sum, course) => sum + course.credits, 0);
  const requirementGroupCredits = plan.requirementGroups.reduce(
    (sum, group) => sum + getRequirementGroupCredits(group, selected, plan),
    0
  );
  const fixedCreditsCompleted = Math.min(
    plan.requirements.fixedDegreeCredits,
    fixedMandatoryCredits + requirementGroupCredits + conversionCreditsAppliedToGeneral
  );
  const totalCreditsCompleted = roundCredit(
    selectedCourses.reduce((sum, course) => sum + course.credits, 0)
  );
  const totalCreditsRemaining = roundCredit(
    Math.max(0, plan.requirements.totalCredits - totalCreditsCompleted)
  );
  const clusterAudits = plan.clusters.map((cluster) => {
    const selectedClusterCourses = selectedCourses.filter((course) => course.clusterId === cluster.id);

    return {
      id: cluster.id,
      name: cluster.name,
      minCourses: cluster.minCourses,
      selectedCourseIds: selectedClusterCourses.map((course) => course.id),
      selectedCredits: roundCredit(
        selectedClusterCourses.reduce((sum, course) => sum + course.credits, 0)
      ),
      satisfied: selectedClusterCourses.length >= cluster.minCourses,
      note: cluster.note,
    };
  });
  const blockedCourses = courseAudits.filter(
    (audit) =>
      !audit.completed &&
      audit.missingPrerequisites.length > 0 &&
      ["required", "elective", "english"].includes(audit.course.type)
  );
  const availableCourses = courseAudits.filter(
    (audit) =>
      !audit.completed &&
      audit.available &&
      ["required", "elective", "general", "sport", "english", "placement", "conversion"].includes(
        audit.course.type
      )
  );
  const warnings = createRuleWarnings(plan.rules, selected, clusterAudits, plan);

  return {
    selectedCourseIds: [...selected],
    totalCreditsCompleted,
    totalCreditsRemaining,
    completionPercent: Math.min(
      100,
      Math.round((totalCreditsCompleted / plan.requirements.totalCredits) * 100)
    ),
    fixedCreditsCompleted: roundCredit(fixedCreditsCompleted),
    fixedCreditsRemaining: roundCredit(
      Math.max(0, plan.requirements.fixedDegreeCredits - fixedCreditsCompleted)
    ),
    electiveCreditsCompleted: roundCredit(electiveCreditsCompleted),
    electiveCreditsRemaining: roundCredit(
      Math.max(0, plan.requirements.electiveCreditsNeeded - electiveCreditsCompleted)
    ),
    generalCreditsCompleted: roundCredit(generalCreditsCompleted),
    generalCreditsRemaining: roundCredit(
      Math.max(0, plan.requirements.generalCredits - generalCreditsCompleted)
    ),
    conversionCreditsAppliedToGeneral: roundCredit(conversionCreditsAppliedToGeneral),
    requiredRemaining: createRequiredGaps(selected, plan, courseMap),
    clusterAudits,
    missingClusters: clusterAudits.filter((cluster) => !cluster.satisfied),
    blockedCourses,
    availableCourses,
    courseAudits,
    warnings,
  };
}
