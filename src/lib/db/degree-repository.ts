import "server-only";

import fs from "node:fs";

import { DEFAULT_PROGRAM_ID, getDatabasePath, getDb } from "@/lib/db/sqlite";
import type {
  Course,
  CourseType,
  CourseTypeDefinition,
  DegreePlan,
  DegreeRule,
  ElectiveCluster,
  PrerequisiteGroup,
  RequirementGroup,
} from "@/types/degree";

type Row = Record<string, unknown>;

let cachedPlan: DegreePlan | null = null;
let cachedSignature: string | null = null;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function toOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function getDbSignature() {
  const dbPath = getDatabasePath();

  try {
    const stat = fs.statSync(dbPath);

    return `${dbPath}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return `${dbPath}:missing`;
  }
}

function requireProgram(programId: string) {
  const row = getDb()
    .prepare(
      `
        SELECT id, title, subtitle, source_file_name, source_pages, source_extracted_at, metadata_json
        FROM programs
        WHERE id = ?
      `
    )
    .get(programId) as Row | undefined;

  if (!row) {
    throw new Error(
      `Degree program "${programId}" was not found. Run "npm run db:seed" before starting the app.`
    );
  }

  return row;
}

function readSettings(programId: string) {
  const rows = getDb()
    .prepare(
      `
        SELECT key, value_json
        FROM program_settings
        WHERE program_id = ?
        ORDER BY sort_order, key
      `
    )
    .all(programId) as Row[];

  return Object.fromEntries(rows.map((row) => [row.key, parseJson(row.value_json, null)]));
}

function readCourseTypes(programId: string): CourseTypeDefinition[] {
  const rows = getDb()
    .prepare(
      `
        SELECT code, label, sort_order, metadata_json
        FROM course_types
        WHERE program_id = ?
        ORDER BY sort_order, code
      `
    )
    .all(programId) as Row[];

  return rows.map((row) => ({
    code: String(row.code) as CourseType,
    label: String(row.label),
    sortOrder: toNumber(row.sort_order),
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
  }));
}

function readRequirementGroups(programId: string): RequirementGroup[] {
  const rows = getDb()
    .prepare(
      `
        SELECT code, name, kind, required_credits, min_courses, metadata_json
        FROM requirement_groups
        WHERE program_id = ?
        ORDER BY sort_order, code
      `
    )
    .all(programId) as Row[];

  return rows.map((row) => {
    const metadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
    const courseIds = Array.isArray(metadata.courseIds)
      ? metadata.courseIds.filter((id): id is string => typeof id === "string")
      : undefined;

    return {
      code: String(row.code),
      name: String(row.name),
      kind: String(row.kind),
      requiredCredits: toOptionalNumber(row.required_credits),
      minCourses: toOptionalNumber(row.min_courses),
      courseIds,
      metadata,
    };
  });
}

function readClusters(programId: string): ElectiveCluster[] {
  const rows = getDb()
    .prepare(
      `
        SELECT code, name, min_courses, note, metadata_json
        FROM clusters
        WHERE program_id = ?
        ORDER BY sort_order, code
      `
    )
    .all(programId) as Row[];

  return rows.map((row) => ({
    id: String(row.code),
    name: String(row.name),
    minCourses: toNumber(row.min_courses, 1),
    note: typeof row.note === "string" ? row.note : undefined,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
  }));
}

function readPrerequisites(programId: string) {
  const groupRows = getDb()
    .prepare(
      `
        SELECT id, course_id, mode, label, sort_order
        FROM course_prerequisite_groups
        WHERE program_id = ?
        ORDER BY course_id, sort_order, id
      `
    )
    .all(programId) as Row[];
  const itemRows = getDb()
    .prepare(
      `
        SELECT group_id, prerequisite_course_id
        FROM course_prerequisite_items
        WHERE group_id IN (
          SELECT id FROM course_prerequisite_groups WHERE program_id = ?
        )
        ORDER BY group_id, sort_order, prerequisite_course_id
      `
    )
    .all(programId) as Row[];
  const idsByGroup = new Map<number, string[]>();
  const prerequisitesByCourse = new Map<string, PrerequisiteGroup[]>();

  itemRows.forEach((row) => {
    const groupId = toNumber(row.group_id);
    const ids = idsByGroup.get(groupId) ?? [];

    ids.push(String(row.prerequisite_course_id));
    idsByGroup.set(groupId, ids);
  });

  groupRows.forEach((row) => {
    const courseId = String(row.course_id);
    const groups = prerequisitesByCourse.get(courseId) ?? [];

    groups.push({
      mode: row.mode === "any" ? "any" : "all",
      ids: idsByGroup.get(toNumber(row.id)) ?? [],
      label: typeof row.label === "string" ? row.label : undefined,
    });
    prerequisitesByCourse.set(courseId, groups);
  });

  return prerequisitesByCourse;
}

function readCorequisites(programId: string) {
  const rows = getDb()
    .prepare(
      `
        SELECT course_id, corequisite_course_id
        FROM course_corequisites
        WHERE program_id = ?
        ORDER BY course_id, sort_order, corequisite_course_id
      `
    )
    .all(programId) as Row[];
  const corequisitesByCourse = new Map<string, string[]>();

  rows.forEach((row) => {
    const courseId = String(row.course_id);
    const ids = corequisitesByCourse.get(courseId) ?? [];

    ids.push(String(row.corequisite_course_id));
    corequisitesByCourse.set(courseId, ids);
  });

  return corequisitesByCourse;
}

function readCourseNotes(programId: string) {
  const rows = getDb()
    .prepare(
      `
        SELECT course_id, body
        FROM course_notes
        WHERE program_id = ?
        ORDER BY course_id, sort_order
      `
    )
    .all(programId) as Row[];
  const notesByCourse = new Map<string, string[]>();

  rows.forEach((row) => {
    const courseId = String(row.course_id);
    const notes = notesByCourse.get(courseId) ?? [];

    notes.push(String(row.body));
    notesByCourse.set(courseId, notes);
  });

  return notesByCourse;
}

function readCourses(programId: string): Course[] {
  const prerequisitesByCourse = readPrerequisites(programId);
  const corequisitesByCourse = readCorequisites(programId);
  const notesByCourse = readCourseNotes(programId);
  const rows = getDb()
    .prepare(
      `
        SELECT id, name, credits, type, is_required, semester, cluster_id,
          requirement_group_code, metadata_json
        FROM courses
        WHERE program_id = ?
        ORDER BY sort_order, semester, id
      `
    )
    .all(programId) as Row[];

  return rows.map((row) => {
    const metadata = parseJson<Record<string, unknown>>(row.metadata_json, {});

    return {
      id: String(row.id),
      name: String(row.name),
      credits: toNumber(row.credits),
      type: String(row.type) as CourseType,
      required: row.is_required === 1,
      semester: toOptionalNumber(row.semester),
      clusterId: typeof row.cluster_id === "string" ? row.cluster_id : undefined,
      requirementGroup:
        typeof row.requirement_group_code === "string" ? row.requirement_group_code : undefined,
      prerequisites: prerequisitesByCourse.get(String(row.id)),
      coRequisites: corequisitesByCourse.get(String(row.id)),
      notes: notesByCourse.get(String(row.id)),
      satisfiesCourseId:
        typeof metadata.satisfiesCourseId === "string" ? metadata.satisfiesCourseId : undefined,
    };
  });
}

function readProgramNotes(programId: string) {
  return (
    getDb()
      .prepare(
        `
          SELECT body
          FROM program_notes
          WHERE program_id = ?
          ORDER BY sort_order
        `
      )
      .all(programId) as Row[]
  ).map((row) => String(row.body));
}

function readRules(programId: string): DegreeRule[] {
  const rows = getDb()
    .prepare(
      `
        SELECT id, type, message, payload_json, enabled
        FROM degree_rules
        WHERE program_id = ?
        ORDER BY sort_order, id
      `
    )
    .all(programId) as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    type: String(row.type),
    message: String(row.message),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    enabled: row.enabled === 1,
  }));
}

export type ProgramSummary = {
  id: string;
  title: string;
  subtitle: string;
};

export function getProgramList(): ProgramSummary[] {
  const rows = getDb()
    .prepare(
      `
        SELECT id, title, subtitle
        FROM programs
        ORDER BY title
      `
    )
    .all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    subtitle: String(row.subtitle),
  }));
}

export function getDegreePlan(programId = DEFAULT_PROGRAM_ID): DegreePlan {
  const signature = getDbSignature();

  if (cachedPlan && cachedSignature === signature && cachedPlan.id === programId) {
    return cachedPlan;
  }

  const program = requireProgram(programId);
  const settings = readSettings(programId);
  const requirementGroups = readRequirementGroups(programId);
  const plan: DegreePlan = {
    id: String(program.id),
    title: String(program.title),
    subtitle: String(program.subtitle),
    source: {
      fileName: String(program.source_file_name),
      pages: String(program.source_pages),
      extractedAt: String(program.source_extracted_at),
    },
    requirements: {
      totalCredits: toNumber(settings.totalCredits),
      fixedDegreeCredits: toNumber(settings.fixedDegreeCredits),
      electiveCreditsNeeded: toNumber(settings.electiveCreditsNeeded),
      generalCredits: toNumber(settings.generalCredits),
      sportCredits: toNumber(settings.sportCredits),
      englishRequiredIds: Array.isArray(settings.englishRequiredIds)
        ? settings.englishRequiredIds.filter((id: unknown): id is string => typeof id === "string")
        : [],
    },
    courseTypes: readCourseTypes(programId),
    requirementGroups,
    clusters: readClusters(programId),
    courses: readCourses(programId),
    rules: readRules(programId),
    notes: readProgramNotes(programId),
  };

  cachedPlan = plan;
  cachedSignature = signature;

  return plan;
}
