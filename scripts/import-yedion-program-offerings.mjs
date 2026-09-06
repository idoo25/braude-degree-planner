import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const rootDir = process.cwd();
const dbPath = process.env.DEGREE_DB_PATH ?? path.join(rootDir, "data", "degree-planner.sqlite");
const schemaPath = path.join(rootDir, "database", "schema", "yedion-catalog.sql");
const defaultOfferingsPath = path.join(rootDir, "data", "yedion", "program-offerings", "software-engineering-2027.json");

function readArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringify(value) {
  return JSON.stringify(value ?? {});
}

const sourcePath = path.resolve(readArg("--offerings", defaultOfferingsPath));
const shouldReset = process.argv.includes("--reset-program-offerings");

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Yedion program-offerings JSON was not found: ${sourcePath}`);
}

const data = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const academicYear = text(data.query?.academicYearValue);
const majorKey = text(data.query?.majorKey);
const majorName = text(data.query?.majorName);

if (!academicYear || !majorKey || !majorName || !Array.isArray(data.exports)) {
  throw new Error("Invalid program-offerings source: query metadata and exports are required.");
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(schemaPath, "utf8"));

const importOfferings = db.transaction(() => {
  if (shouldReset) {
    db.prepare("DELETE FROM yedion_program_offering_sources WHERE academic_year_value = ? AND major_key = ?").run(
      academicYear,
      majorKey
    );
  }

  const insertRun = db.prepare(`
    INSERT INTO yedion_import_runs (
      source_year, base_url, started_at, finished_at, status, options_json, stats_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const runId = Number(
    insertRun.run(
      academicYear,
      "https://info.braude.ac.il/yedion/fireflyweb.aspx",
      new Date().toISOString(),
      new Date().toISOString(),
      "program-offerings-imported",
      stringify({ sourcePath: path.relative(rootDir, sourcePath).replaceAll(path.sep, "/"), reset: shouldReset }),
      stringify(data.stats)
    ).lastInsertRowid
  );

  const upsertSource = db.prepare(`
    INSERT INTO yedion_program_offering_sources (
      academic_year_value, major_key, major_name, export_id, source_file,
      source_sha256, source_modified_at, sheet_name, raw_json, import_run_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(academic_year_value, major_key, export_id) DO UPDATE SET
      major_name = excluded.major_name,
      source_file = excluded.source_file,
      source_sha256 = excluded.source_sha256,
      source_modified_at = excluded.source_modified_at,
      sheet_name = excluded.sheet_name,
      raw_json = excluded.raw_json,
      import_run_id = excluded.import_run_id,
      updated_at = CURRENT_TIMESTAMP
  `);
  const sourceByKey = db.prepare(
    "SELECT id FROM yedion_program_offering_sources WHERE academic_year_value = ? AND major_key = ? AND export_id = ?"
  );
  const deleteRowsForSource = db.prepare("DELETE FROM yedion_program_offerings WHERE source_id = ?");
  const insertCourse = db.prepare(`
    INSERT INTO yedion_program_offerings (
      source_id, academic_year_value, major_key, course_code, course_name,
      taught_status, timetable_search_text, notes, source_row_index, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  let offeringRows = 0;
  for (const exportData of data.exports) {
    const exportId = text(exportData.exportId);
    if (!exportId) {
      throw new Error("Every program-offerings export requires an exportId.");
    }
    upsertSource.run(
      academicYear,
      majorKey,
      majorName,
      exportId,
      text(exportData.sourceFile),
      text(exportData.sourceSha256),
      text(exportData.sourceModifiedAt),
      text(exportData.sheetName),
      stringify(exportData),
      runId
    );
    const source = sourceByKey.get(academicYear, majorKey, exportId);
    const sourceId = Number(source.id);
    deleteRowsForSource.run(sourceId);

    for (const course of exportData.courses ?? []) {
      const courseCode = text(course.courseCode);
      if (!courseCode) continue;
      insertCourse.run(
        sourceId,
        academicYear,
        majorKey,
        courseCode,
        text(course.courseName),
        text(course.taughtStatus),
        text(course.timetableSearchText),
        text(course.notes),
        Number.isFinite(Number(course.rowIndex)) ? Number(course.rowIndex) : null,
        stringify(course)
      );
      offeringRows += 1;
    }
  }

  return {
    runId,
    offeringRows,
    sourceCount: db
      .prepare("SELECT COUNT(*) AS value FROM yedion_program_offering_sources WHERE academic_year_value = ? AND major_key = ?")
      .get(academicYear, majorKey).value,
    uniqueCourses: db
      .prepare("SELECT COUNT(DISTINCT course_code) AS value FROM yedion_program_offerings WHERE academic_year_value = ? AND major_key = ?")
      .get(academicYear, majorKey).value,
  };
});

const summary = importOfferings();
db.close();

console.log(JSON.stringify({ ok: true, dbPath, sourcePath, academicYear, majorKey, ...summary }, null, 2));
