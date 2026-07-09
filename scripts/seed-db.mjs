import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const rootDir = process.cwd();
const dbPath = process.env.DEGREE_DB_PATH ?? path.join(rootDir, "data", "degree-planner.sqlite");
const sourcePath = path.join(rootDir, "database", "seed", "braude-software-2020.ts");
const shouldReset = process.argv.includes("--reset");

function readSeedPlan() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require: (specifier) => {
      if (specifier.startsWith("@/types/")) {
        return {};
      }

      throw new Error(`Unexpected seed import: ${specifier}`);
    },
  };

  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox, { filename: sourcePath });

  return sandbox.module.exports.degreePlan ?? sandbox.exports.degreePlan;
}

function stringify(value) {
  return JSON.stringify(value ?? {});
}

const scheduleSectionsPath = path.join(rootDir, "database", "seed", "schedule-sections.json");

function readScheduleSections() {
  if (!fs.existsSync(scheduleSectionsPath)) {
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(scheduleSectionsPath, "utf8"));

  return Array.isArray(raw) ? raw : [];
}

function execSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      source_file_name TEXT NOT NULL,
      source_pages TEXT NOT NULL,
      source_extracted_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS course_types (
      program_id TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (program_id, code),
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS program_settings (
      program_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (program_id, key),
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS requirement_groups (
      program_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      required_credits REAL,
      min_courses INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (program_id, code),
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clusters (
      program_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      min_courses INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (program_id, code),
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS courses (
      program_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      credits REAL NOT NULL,
      type TEXT NOT NULL,
      is_required INTEGER NOT NULL DEFAULT 0,
      semester INTEGER,
      cluster_id TEXT,
      requirement_group_code TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (program_id, id),
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
      FOREIGN KEY (program_id, type) REFERENCES course_types(program_id, code),
      FOREIGN KEY (program_id, cluster_id) REFERENCES clusters(program_id, code),
      FOREIGN KEY (program_id, requirement_group_code) REFERENCES requirement_groups(program_id, code)
    );

    CREATE TABLE IF NOT EXISTS course_prerequisite_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('all', 'any')),
      label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (program_id, course_id) REFERENCES courses(program_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_prerequisite_items (
      group_id INTEGER NOT NULL,
      prerequisite_course_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, prerequisite_course_id),
      FOREIGN KEY (group_id) REFERENCES course_prerequisite_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_corequisites (
      program_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      corequisite_course_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (program_id, course_id, corequisite_course_id),
      FOREIGN KEY (program_id, course_id) REFERENCES courses(program_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_notes (
      program_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      body TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (program_id, course_id, sort_order),
      FOREIGN KEY (program_id, course_id) REFERENCES courses(program_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS program_notes (
      program_id TEXT NOT NULL,
      body TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (program_id, sort_order),
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS degree_rules (
      program_id TEXT NOT NULL,
      id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (program_id, id),
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_courses_program_type ON courses(program_id, type);
    CREATE INDEX IF NOT EXISTS idx_courses_program_semester ON courses(program_id, semester);
    CREATE INDEX IF NOT EXISTS idx_courses_program_cluster ON courses(program_id, cluster_id);
    CREATE INDEX IF NOT EXISTS idx_courses_program_required ON courses(program_id, is_required);
    CREATE INDEX IF NOT EXISTS idx_courses_program_requirement_group ON courses(program_id, requirement_group_code);
    CREATE INDEX IF NOT EXISTS idx_prereq_groups_course ON course_prerequisite_groups(program_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_prereq_items_course ON course_prerequisite_items(prerequisite_course_id);
    CREATE INDEX IF NOT EXISTS idx_coreq_course ON course_corequisites(program_id, course_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS course_search USING fts5(
      program_id UNINDEXED,
      course_id UNINDEXED,
      name,
      type,
      cluster_name,
      tokenize = 'unicode61'
    );

    CREATE TABLE IF NOT EXISTS course_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      semester_period TEXT NOT NULL,
      section_type TEXT NOT NULL,
      group_code TEXT NOT NULL,
      track_note TEXT,
      lecturer_name TEXT,
      is_full INTEGER NOT NULL DEFAULT 0,
      teaching_language TEXT,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sections_program_course ON course_sections(program_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_sections_program_semester ON course_sections(program_id, semester_period);
  `);
}

function seed(db, plan) {
  const programId = plan.id;
  const courseTypeLabelByCode = new Map(plan.courseTypes.map((type) => [type.code, type.label]));
  const insertProgram = db.prepare(`
    INSERT INTO programs (
      id, title, subtitle, source_file_name, source_pages, source_extracted_at, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  const insertCourseType = db.prepare(`
    INSERT INTO course_types (program_id, code, label, sort_order, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertSetting = db.prepare(`
    INSERT INTO program_settings (program_id, key, value_json, sort_order)
    VALUES (?, ?, ?, ?)
  `);
  const insertRequirementGroup = db.prepare(`
    INSERT INTO requirement_groups (
      program_id, code, name, kind, required_credits, min_courses, metadata_json, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCluster = db.prepare(`
    INSERT INTO clusters (program_id, code, name, min_courses, note, metadata_json, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCourse = db.prepare(`
    INSERT INTO courses (
      program_id, id, name, credits, type, is_required, semester, cluster_id,
      requirement_group_code, metadata_json, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPrereqGroup = db.prepare(`
    INSERT INTO course_prerequisite_groups (program_id, course_id, mode, label, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertPrereqItem = db.prepare(`
    INSERT INTO course_prerequisite_items (group_id, prerequisite_course_id, sort_order)
    VALUES (?, ?, ?)
  `);
  const insertCoreq = db.prepare(`
    INSERT INTO course_corequisites (program_id, course_id, corequisite_course_id, sort_order)
    VALUES (?, ?, ?, ?)
  `);
  const insertCourseNote = db.prepare(`
    INSERT INTO course_notes (program_id, course_id, body, sort_order)
    VALUES (?, ?, ?, ?)
  `);
  const insertProgramNote = db.prepare(`
    INSERT INTO program_notes (program_id, body, sort_order)
    VALUES (?, ?, ?)
  `);
  const insertRule = db.prepare(`
    INSERT INTO degree_rules (program_id, id, type, message, payload_json, enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSearch = db.prepare(`
    INSERT INTO course_search (program_id, course_id, name, type, cluster_name)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertSection = db.prepare(`
    INSERT INTO course_sections (
      program_id, course_id, academic_year, semester_period, section_type, group_code,
      track_note, lecturer_name, is_full, teaching_language, day_of_week, start_time, end_time,
      room, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM course_search WHERE program_id = ?").run(programId);
    db.prepare("DELETE FROM course_sections WHERE program_id = ?").run(programId);
    db.prepare("DELETE FROM programs WHERE id = ?").run(programId);

    insertProgram.run(
      programId,
      plan.title,
      plan.subtitle,
      plan.source.fileName,
      plan.source.pages,
      plan.source.extractedAt,
      stringify({ sourceKind: "pdf-extraction", version: 1 })
    );

    plan.courseTypes.forEach((type, index) => {
      insertCourseType.run(
        programId,
        type.code,
        type.label,
        type.sortOrder ?? index,
        stringify(type.metadata ?? {})
      );
    });

    Object.entries(plan.requirements).forEach(([key, value], index) => {
      insertSetting.run(programId, key, stringify(value), index);
    });

    plan.requirementGroups.forEach((group, index) => {
      insertRequirementGroup.run(
        programId,
        group.code,
        group.name,
        group.kind,
        group.requiredCredits ?? null,
        group.minCourses ?? null,
        stringify({ ...(group.metadata ?? {}), courseIds: group.courseIds ?? [] }),
        index
      );
    });

    plan.clusters.forEach((cluster, index) => {
      insertCluster.run(
        programId,
        cluster.id,
        cluster.name,
        cluster.minCourses,
        cluster.note ?? null,
        stringify({}),
        index
      );
    });

    const clusterNames = new Map(plan.clusters.map((cluster) => [cluster.id, cluster.name]));

    plan.courses.forEach((course, index) => {
      insertCourse.run(
        programId,
        course.id,
        course.name,
        course.credits,
        course.type,
        course.required ? 1 : 0,
        course.semester ?? null,
        course.clusterId ?? null,
        course.requirementGroup ?? null,
        stringify({ satisfiesCourseId: course.satisfiesCourseId ?? null }),
        index
      );

      (course.prerequisites ?? []).forEach((group, groupIndex) => {
        const result = insertPrereqGroup.run(
          programId,
          course.id,
          group.mode,
          group.label ?? null,
          groupIndex
        );
        const groupId = Number(result.lastInsertRowid);

        group.ids.forEach((id, itemIndex) => {
          insertPrereqItem.run(groupId, id, itemIndex);
        });
      });

      (course.coRequisites ?? []).forEach((id, coreqIndex) => {
        insertCoreq.run(programId, course.id, id, coreqIndex);
      });

      (course.notes ?? []).forEach((note, noteIndex) => {
        insertCourseNote.run(programId, course.id, note, noteIndex);
      });

      insertSearch.run(
        programId,
        course.id,
        course.name,
        courseTypeLabelByCode.get(course.type) ?? course.type,
        course.clusterId ? clusterNames.get(course.clusterId) ?? "" : ""
      );
    });

    plan.notes.forEach((note, index) => {
      insertProgramNote.run(programId, note, index);
    });

    plan.rules.forEach((rule, index) => {
      insertRule.run(
        programId,
        rule.id,
        rule.type,
        rule.message,
        stringify(rule.payload),
        rule.enabled ? 1 : 0,
        index
      );
    });

    readScheduleSections().forEach((section, index) => {
      insertSection.run(
        programId,
        section.courseId,
        section.academicYear,
        section.semesterPeriod,
        section.sectionType,
        section.groupCode,
        section.trackNote ?? null,
        section.lecturerName ?? null,
        section.isFull ? 1 : 0,
        section.teachingLanguage ?? null,
        section.dayOfWeek,
        section.startTime,
        section.endTime,
        section.room ?? null,
        index
      );
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

if (shouldReset && fs.existsSync(dbPath)) {
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
}

const plan = readSeedPlan();
const db = new DatabaseSync(dbPath);

execSchema(db);
seed(db, plan);
db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      dbPath,
      programId: plan.id,
      courses: plan.courses.length,
      clusters: plan.clusters.length,
    },
    null,
    2
  )
);
