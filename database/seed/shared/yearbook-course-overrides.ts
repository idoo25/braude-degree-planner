import type { Course } from "@/types/degree";

export type YearbookCourseOverride = Partial<Pick<
  Course,
  "credits" | "semester" | "type" | "required" | "prerequisites" | "coRequisites" | "requirementGroup" | "clusterId"
>>;

/** Applies only source-verified fields from a new yearbook edition. */
export function applyYearbookCourseOverrides(
  courses: Course[],
  overrides: Record<string, YearbookCourseOverride>
): Course[] {
  return courses.map((course) => {
    const override = overrides[course.id];
    return override ? { ...course, ...override } : course;
  });
}
