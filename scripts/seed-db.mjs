import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const rootDir = process.cwd();
const dbPath = process.env.DEGREE_DB_PATH ?? path.join(rootDir, "data", "degree-planner.sqlite");
const programsDir = path.join(rootDir, "database", "seed", "programs");
const shouldReset = process.argv.includes("--reset");

function listProgramSourcePaths() {
  return fs
    .readdirSync(programsDir)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => path.join(programsDir, name));
}

function readSeedModule(sourcePath, moduleCache = new Map()) {
  const cached = moduleCache.get(sourcePath);

  if (cached) {
    return cached;
  }

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

      if (specifier.includes("shared/general-and-sport-courses")) {
        const sharedPath = path.join(rootDir, "database", "seed", "shared", "general-and-sport-courses.json");

        return JSON.parse(fs.readFileSync(sharedPath, "utf8"));
      }

      if (specifier.startsWith(".")) {
        const importedPath = path.resolve(path.dirname(sourcePath), `${specifier}.ts`);

        return readSeedModule(importedPath, moduleCache);
      }

      throw new Error(`Unexpected seed import: ${specifier}`);
    },
  };

  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox, { filename: sourcePath });

  const exported = Object.keys(sandbox.module.exports).length ? sandbox.module.exports : sandbox.exports;

  moduleCache.set(sourcePath, exported);

  return exported;
}

function readSeedPlan(sourcePath, moduleCache = new Map()) {
  const seedModule = readSeedModule(sourcePath, moduleCache);
  const plan = seedModule.degreePlan;

  return plan;
}

function stringify(value) {
  return JSON.stringify(value ?? {});
}

const yedionCodeAliasesPath = path.join(
  rootDir,
  "database",
  "seed",
  "shared",
  "yedion-code-aliases.json"
);
const yearbook2026ExtractionPath = path.join(
  rootDir,
  "data",
  "yearbook",
  "shnaton-2026-extraction.json"
);
const yearbookProgramKeys = {
  "applied-mathematics-2026": "applied-mathematics",
  "biotechnology-engineering-2026": "biotechnology-engineering",
  "braude-software-2026": "braude-software-2020",
  "civil-engineering-2026": "civil-engineering",
  "electrical-engineering-2026": "electrical-engineering",
  "industrial-engineering-bsc-2026": "industrial-engineering-bsc",
  "information-systems-engineering-2026": "information-systems-engineering",
  "mechanical-engineering-bsc-2026": "mechanical-engineering-bsc",
  "msc-biotechnology-2026": "msc-biotechnology",
  "msc-industrial-engineering-2026": "msc-industrial-engineering",
  "msc-software-engineering-2026": "msc-software-engineering",
  "msc-systems-engineering-2026": "msc-systems-engineering",
  "teaching-general-studies-2026": "teaching-general-studies",
};

function readYedionCodeAliases() {
  if (!fs.existsSync(yedionCodeAliasesPath)) {
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(yedionCodeAliasesPath, "utf8"));

  return Array.isArray(raw?.aliases) ? raw.aliases : [];
}

function readYearbook2026Extraction() {
  if (!fs.existsSync(yearbook2026ExtractionPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(yearbook2026ExtractionPath, "utf8"));
}

function normalizeYearbookName(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").replace(/^\*+\s*/, "").trim() : "";
}

function applyYearbook2026Facts(plan, extraction) {
  const yearbookProgramKey = yearbookProgramKeys[plan.id];
  const sourceCourses = extraction?.programs?.[yearbookProgramKey]?.courses;

  if (!yearbookProgramKey || !Array.isArray(sourceCourses)) {
    return plan;
  }

  const factsByCourseId = new Map(
    sourceCourses
      .filter(
        (course) =>
          course?.source === "grid" &&
          typeof course.id === "string" &&
          typeof course.credits === "number" &&
          Number.isFinite(course.credits) &&
          course.credits >= 0 &&
          course.credits <= 20
      )
      .map((course) => [course.id, course])
  );

  return {
    ...plan,
    courses: plan.courses.map((course) => {
      const fact = factsByCourseId.get(course.id);

      if (!fact) {
        return course;
      }

      const officialName = normalizeYearbookName(fact.name);
      const hasHebrewName = /[\u0590-\u05ff]/.test(officialName);

      return {
        ...course,
        name: hasHebrewName ? officialName : course.name,
        credits: fact.credits > 0 ? fact.credits : course.credits,
      };
    }),
  };
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

    CREATE TABLE IF NOT EXISTS yedion_code_aliases (
      course_id TEXT PRIMARY KEY,
      yedion_course_code TEXT NOT NULL,
      note TEXT
    );

    -- Legacy schedule tables (course_sections/course_syllabi) were superseded by the
    -- yedion_* catalog; drop them if this DB predates the unification.
    DROP TABLE IF EXISTS course_sections;
    DROP TABLE IF EXISTS course_syllabi;
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
  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM course_search WHERE program_id = ?").run(programId);
    db.prepare("DELETE FROM programs WHERE id = ?").run(programId);

    insertProgram.run(
      programId,
      plan.title,
      plan.subtitle,
      plan.source.fileName,
      plan.source.pages,
      plan.source.extractedAt,
      stringify({
        sourceKind: "pdf-extraction",
        version: 1,
        catalogYear: plan.catalogYear ?? null,
        status: plan.status ?? "active",
      })
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

const sourcePaths = listProgramSourcePaths();
const yearbook2026Extraction = readYearbook2026Extraction();
const plans = sourcePaths.map((sourcePath) => {
  const plan = applyYearbook2026Facts(readSeedPlan(sourcePath), yearbook2026Extraction);

  if (!plan) {
    throw new Error(`No "degreePlan" export found in ${sourcePath}`);
  }

  return plan;
});

const db = new DatabaseSync(dbPath);

execSchema(db);
plans.forEach((plan) => seed(db, plan));

const codeAliases = readYedionCodeAliases();
const insertAlias = db.prepare(`
  INSERT INTO yedion_code_aliases (course_id, yedion_course_code, note)
  VALUES (?, ?, ?)
`);

db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("DELETE FROM yedion_code_aliases").run();
  codeAliases.forEach((alias) => {
    insertAlias.run(alias.courseId, alias.yedionCourseCode, alias.note ?? null);
  });
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      dbPath,
      programs: plans.map((plan) => ({
        programId: plan.id,
        courses: plan.courses.length,
        clusters: plan.clusters.length,
      })),
    },
    null,
    2
  )
);
