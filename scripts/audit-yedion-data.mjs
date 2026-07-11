import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const rootDir = process.cwd();
const dbPath = process.env.DEGREE_DB_PATH ?? path.join(rootDir, "data", "degree-planner.sqlite");
const outputPath = path.resolve(
  process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length) ??
    path.join(rootDir, "data", "yedion", "quality-report.json")
);

const db = new Database(dbPath, { readonly: true });

function one(query) {
  return db.prepare(query).get();
}

function rows(query) {
  return db.prepare(query).all();
}

const summary = one(`
  SELECT
    (SELECT COUNT(*) FROM yedion_courses) AS courses,
    (SELECT COUNT(*) FROM yedion_course_sections) AS sections,
    (SELECT COUNT(*) FROM yedion_section_meetings) AS meetings,
    (SELECT COUNT(*) FROM yedion_exams) AS detail_exam_rows,
    (SELECT COUNT(*) FROM yedion_exam_slots) AS canonical_exam_slots,
    (SELECT COUNT(*) FROM yedion_syllabi) AS syllabi,
    (SELECT COUNT(*) FROM yedion_section_links) AS section_links,
    (SELECT COUNT(*) FROM yedion_course_relations) AS raw_relations
`);

const courseSemesterDetails = one(`
  WITH semester_groups AS (
    SELECT
      course_code,
      COALESCE(academic_year_label, '') AS academic_year_label,
      COALESCE(semester_code, semester_period, '') AS semester_code,
      MAX(CASE WHEN raw_json LIKE '%"details":%' THEN 1 ELSE 0 END) AS has_details
    FROM yedion_course_sections
    GROUP BY course_code, COALESCE(academic_year_label, ''), COALESCE(semester_code, semester_period, '')
  )
  SELECT
    COUNT(*) AS groups,
    SUM(has_details) AS groups_with_details,
    SUM(CASE WHEN has_details = 0 THEN 1 ELSE 0 END) AS groups_missing_details
  FROM semester_groups
`);

const scheduleQuality = rows(`
  SELECT schedule_status, COUNT(*) AS sections
  FROM yedion_section_schedule_quality
  GROUP BY schedule_status
  ORDER BY schedule_status
`);

const linkQuality = rows(`
  SELECT resolution_status, COUNT(*) AS links
  FROM yedion_section_link_resolution
  GROUP BY resolution_status
  ORDER BY resolution_status
`);

const dependencyQuality = rows(`
  SELECT dependency_kind, COUNT(*) AS relations,
    SUM(CASE WHEN required_course_code IS NOT NULL AND required_course_name IS NULL THEN 1 ELSE 0 END) AS unresolved_codes,
    SUM(CASE WHEN required_course_code IS NULL THEN 1 ELSE 0 END) AS label_only_relations
  FROM yedion_dependency_resolution
  GROUP BY dependency_kind
  ORDER BY dependency_kind
`);

const programOfferingCoverage = one(`
  SELECT
    COUNT(*) AS program_course_records,
    SUM(CASE WHEN y.course_code IS NOT NULL THEN 1 ELSE 0 END) AS offered_course_records,
    SUM(CASE WHEN y.course_code IS NULL THEN 1 ELSE 0 END) AS not_offered_course_records
  FROM courses plan_course
  LEFT JOIN yedion_courses y ON y.course_code = plan_course.id
`);

const report = {
  generatedAt: new Date().toISOString(),
  dbPath,
  summary,
  courseSemesterDetails,
  scheduleQuality,
  linkQuality,
  dependencyQuality,
  programOfferingCoverage,
  samples: {
    missingDetails: rows(`
      WITH semester_groups AS (
        SELECT
          course_code,
          COALESCE(academic_year_label, '') AS academic_year_label,
          COALESCE(semester_code, semester_period, '') AS semester_code,
          MAX(CASE WHEN raw_json LIKE '%"details":%' THEN 1 ELSE 0 END) AS has_details
        FROM yedion_course_sections
        GROUP BY course_code, COALESCE(academic_year_label, ''), COALESCE(semester_code, semester_period, '')
      )
      SELECT course_code, academic_year_label, semester_code
      FROM semester_groups
      WHERE has_details = 0
      ORDER BY course_code
      LIMIT 20
    `),
    unpublishedTimes: rows(`
      SELECT course_code, course_name, section_type, group_code, group_number
      FROM yedion_section_schedule_quality
      WHERE schedule_status <> 'scheduled'
      ORDER BY course_code, section_type, group_code, group_number
      LIMIT 20
    `),
    unresolvedLinks: rows(`
      SELECT course_code, required_course_code, required_section_type, detail_arguments
      FROM yedion_section_link_resolution
      WHERE resolution_status = 'unresolved'
      ORDER BY course_code
      LIMIT 20
    `),
  },
};

db.close();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, outputPath, report }, null, 2));
