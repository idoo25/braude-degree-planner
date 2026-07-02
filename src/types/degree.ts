export type CourseType =
  | "required"
  | "elective"
  | "general"
  | "sport"
  | "english"
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

export type CourseAudit = {
  course: Course;
  completed: boolean;
  available: boolean;
  missingPrerequisites: MissingPrerequisite[];
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
