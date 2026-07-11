export type CourseType =
  | "required"
  | "elective"
  | "general"
  | "sport"
  | "english"
  | "language"
  | "placement"
  | "conversion";

export type PrerequisiteMode = "all" | "any";

export type PrerequisiteGroup = {
  mode: PrerequisiteMode;
  ids: string[];
  label?: string;
};

export type Course = {
  id: string;
  name: string;
  credits: number;
  type: CourseType;
  required?: boolean;
  semester?: number;
  clusterId?: string;
  requirementGroup?: string;
  prerequisites?: PrerequisiteGroup[];
  coRequisites?: string[];
  notes?: string[];
  /** When selected, this course (e.g. a placement/exemption) satisfies the credit and required-course requirement of the referenced course id instead of the student taking it. */
  satisfiesCourseId?: string;
};

export type ElectiveCluster = {
  id: string;
  name: string;
  minCourses: number;
  note?: string;
  metadata?: Record<string, unknown>;
};

export type CourseTypeDefinition = {
  code: CourseType;
  label: string;
  sortOrder: number;
  metadata?: Record<string, unknown>;
};

export type RequirementGroup = {
  code: string;
  name: string;
  kind: "alternative" | "credits" | "courses" | string;
  requiredCredits?: number;
  minCourses?: number;
  courseIds?: string[];
  metadata?: Record<string, unknown>;
};

export type DegreeRule = {
  id: string;
  type: "mutual_exclusion" | "conversion_requires_cluster" | string;
  message: string;
  payload: Record<string, unknown>;
  enabled: boolean;
};

export type DegreePlan = {
  id: string;
  title: string;
  subtitle: string;
  /** Yearbook edition this curriculum was extracted from, e.g. 'תשפ"ד (2023-2024)'. */
  catalogYear?: string;
  /** "active" (default) shows in the main picker; "archived" moves it to a closed-programs section. */
  status?: "active" | "archived";
  source: {
    fileName: string;
    pages: string;
    extractedAt: string;
  };
  requirements: {
    totalCredits: number;
    fixedDegreeCredits: number;
    electiveCreditsNeeded: number;
    generalCredits: number;
    sportCredits: number;
    englishRequiredIds: string[];
  };
  courseTypes: CourseTypeDefinition[];
  requirementGroups: RequirementGroup[];
  clusters: ElectiveCluster[];
  courses: Course[];
  rules: DegreeRule[];
  notes: string[];
};

export type MissingPrerequisite = {
  label: string;
  ids: string[];
};

export type CoRequisiteStatus = "none" | "satisfied" | "recommended";

export type CourseAudit = {
  course: Course;
  completed: boolean;
  available: boolean;
  missingPrerequisites: MissingPrerequisite[];
  /** True only when the course is blocked purely by an unmet prerequisite - false whenever a mutual-exclusion conflict is also present, since a chosen equivalent/alternative supersedes the course regardless of its own prerequisite state. */
  blockedByPrerequisite: boolean;
  /**
   * Corequisites never block availability - a corequisite is satisfied either by prior completion
   * or by taking it in the same semester, so it's surfaced as a recommendation, not a gate.
   * "satisfied": no corequisites, or all of them are already completed.
   * "recommended": at least one corequisite exists and isn't completed yet - suggest taking it together.
   */
  coRequisiteStatus: CoRequisiteStatus;
  unsatisfiedCoRequisites: string[];
};

export type ClusterAudit = {
  id: string;
  name: string;
  minCourses: number;
  selectedCourseIds: string[];
  selectedCredits: number;
  satisfied: boolean;
  note?: string;
};

export type RequirementGap = {
  id: string;
  label: string;
  credits?: number;
  courseIds?: string[];
};

export type DegreeAudit = {
  selectedCourseIds: string[];
  totalCreditsCompleted: number;
  totalCreditsRemaining: number;
  completionPercent: number;
  fixedCreditsCompleted: number;
  fixedCreditsRemaining: number;
  electiveCreditsCompleted: number;
  electiveCreditsRemaining: number;
  generalCreditsCompleted: number;
  generalCreditsRemaining: number;
  conversionCreditsAppliedToGeneral: number;
  requiredRemaining: RequirementGap[];
  clusterAudits: ClusterAudit[];
  missingClusters: ClusterAudit[];
  blockedCourses: CourseAudit[];
  availableCourses: CourseAudit[];
  courseAudits: CourseAudit[];
  warnings: string[];
};
