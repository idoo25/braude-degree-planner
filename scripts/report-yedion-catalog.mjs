import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const rootDir = process.cwd();
const dbPath = process.env.DEGREE_DB_PATH ?? path.join(rootDir, "data", "degree-planner.sqlite");
const defaultCatalogPath = path.join(rootDir, "data", "yedion", "catalog-current.json");

function tableCount(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS value FROM ${tableName}`).get().value;
}

function normalizeSemesterValue(value) {
  const text = String(value || "").trim();
  if (text === "\u05d0") return "1";
  if (text === "\u05d1") return "2";
  if (text === "\u05d2" || text === "\u05e7\u05d9\u05e5") return "3";
  return text;
}

function courseSemesterCoverage(catalog) {
  const groups = new Map();
  for (const course of catalog.courses ?? []) {
    for (const section of course.sections ?? []) {
      const academicYearLabel =
        section.academicYearLabel ?? course.academicYearLabel ?? "";
      const semester = normalizeSemesterValue(section.semesterCode || section.semesterPeriod);
      const key = [course.courseCode, academicYearLabel, semester].join("|");
      const group = groups.get(key) ?? {
        courseCode: course.courseCode,
        courseName: course.name,
        academicYearLabel,
        semester,
        sections: 0,
        hasDetails: false,
      };
      group.sections += 1;
      if (section.details || section.detailError) {
        group.hasDetails = true;
      }
      groups.set(key, group);
    }
  }

  const allGroups = Array.from(groups.values());
  const missingGroups = allGroups.filter((group) => !group.hasDetails);
  return {
    groups: allGroups.length,
    groupsWithDetails: allGroups.length - missingGroups.length,
    missingGroups: missingGroups.length,
    missingSample: missingGroups
      .sort((a, b) => String(a.courseCode).localeCompare(String(b.courseCode), "he"))
      .slice(0, 20),
  };
}

function maybeReadCatalog() {
  if (!fs.existsSync(defaultCatalogPath)) {
    return null;
  }

  const catalog = JSON.parse(fs.readFileSync(defaultCatalogPath, "utf8"));
  return {
    path: defaultCatalogPath,
    stats: catalog.stats,
    source: catalog.source,
    courseSemesterCoverage: courseSemesterCoverage(catalog),
  };
}

const db = new Database(dbPath, { readonly: true });
const yedionTables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'yedion_%' ORDER BY name")
  .all()
  .map((row) => row.name);

const counts = Object.fromEntries(yedionTables.map((tableName) => [tableName, tableCount(db, tableName)]));
const statusRows = db
  .prepare(
    `SELECT
      COUNT(*) AS courses,
      SUM(CASE WHEN section_count > 0 THEN 1 ELSE 0 END) AS courses_with_sections,
      SUM(section_count) AS sections,
      SUM(detailed_section_count) AS detailed_sections,
      SUM(meeting_count) AS meetings,
      SUM(exam_count) AS exams,
      SUM(has_syllabus) AS courses_with_syllabus
    FROM yedion_course_import_status`
  )
  .get();

const missingDetail = db
  .prepare(
    `SELECT course_code, course_name, section_type, group_code, group_number
     FROM yedion_detail_queue
     LIMIT 20`
  )
  .all();

const nextCoursesForDetails = db
  .prepare(
    `SELECT course_code, name, section_count, detailed_section_count
     FROM yedion_course_import_status
     WHERE section_count > detailed_section_count
     ORDER BY course_code
     LIMIT 20`
  )
  .all();

const relationshipStatus = db
  .prepare(
    `SELECT
      (SELECT COUNT(*) FROM yedion_course_relations) AS course_relations,
      (SELECT COUNT(*) FROM yedion_course_dependency_edges) AS dependency_edges,
      (SELECT COUNT(*) FROM yedion_section_links) AS section_links,
      (SELECT COUNT(*) FROM yedion_section_required_options) AS required_section_options,
      (SELECT COUNT(*) FROM yedion_course_required_component_types) AS required_component_rules,
      (SELECT COUNT(DISTINCT room) FROM yedion_room_busy_windows) AS rooms_with_busy_windows,
      (SELECT COUNT(*) FROM yedion_room_busy_windows) AS room_busy_windows,
      (SELECT COUNT(DISTINCT lecturer_name) FROM yedion_lecturer_busy_windows) AS lecturers_with_busy_windows,
      (SELECT COUNT(*) FROM yedion_lecturer_busy_windows) AS lecturer_busy_windows`
  )
  .get();

const requiredComponentSample = db
  .prepare(
    `SELECT course_code, course_name, source_section_type, required_section_type, source_section_count, option_count
     FROM yedion_course_required_component_types
     ORDER BY course_code, source_section_type, required_section_type
     LIMIT 20`
  )
  .all();

db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      dbPath,
      catalog: maybeReadCatalog(),
      counts,
      status: statusRows,
      relationships: relationshipStatus,
      requiredComponentSample,
      nextCoursesForDetails,
      missingDetailSample: missingDetail,
    },
    null,
    2
  )
);
