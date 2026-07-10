import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const rootDir = process.cwd();
const dbPath = process.env.DEGREE_DB_PATH ?? path.join(rootDir, "data", "degree-planner.sqlite");
const schemaPath = path.join(rootDir, "database", "schema", "yedion-catalog.sql");
const defaultSchedulePath = path.join(
  rootDir,
  "data",
  "yedion",
  "search",
  "day-hour-2026-all-days-0830-semesters-a-b.json"
);
const defaultExamPath = path.join(
  rootDir,
  "data",
  "yedion",
  "search",
  "exams-2026-empty-major-all-semesters-deduped.json"
);

function readArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function stringify(value) {
  return JSON.stringify(value ?? {});
}

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function relativeToRoot(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, "/");
}

const schedulePath = path.resolve(readArg("--schedule", defaultSchedulePath));
const examPath = path.resolve(readArg("--exams", defaultExamPath));
const shouldReset = process.argv.includes("--reset-search");

if (!fs.existsSync(schedulePath)) {
  throw new Error(`Yedion day/hour search JSON was not found: ${schedulePath}`);
}

if (!fs.existsSync(examPath)) {
  throw new Error(`Yedion exam search JSON was not found: ${examPath}`);
}

const scheduleData = JSON.parse(fs.readFileSync(schedulePath, "utf8"));
const examData = JSON.parse(fs.readFileSync(examPath, "utf8"));
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");
if (shouldReset) {
  db.exec(`
    DROP VIEW IF EXISTS yedion_search_timetable_items;
    DROP VIEW IF EXISTS yedion_search_exam_items;
    DROP TABLE IF EXISTS yedion_search_schedule_rows;
    DROP TABLE IF EXISTS yedion_search_exams;
  `);
}
db.exec(fs.readFileSync(schemaPath, "utf8"));

const importSearchResults = db.transaction(() => {
  if (shouldReset) {
    db.exec(`
      DELETE FROM yedion_search_schedule_rows;
      DELETE FROM yedion_search_exams;
    `);
  }

  const insertRun = db.prepare(`
    INSERT INTO yedion_import_runs (
      source_year, base_url, started_at, finished_at, status, options_json, stats_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const runId = Number(
    insertRun.run(
      "2026",
      "https://info.braude.ac.il/yedion/fireflyweb.aspx",
      new Date().toISOString(),
      new Date().toISOString(),
      "search-imported",
      stringify({
        resetSearch: shouldReset,
        schedulePath: relativeToRoot(schedulePath),
        examPath: relativeToRoot(examPath),
      }),
      stringify({
        schedule: scheduleData.stats,
        exams: examData.stats,
      })
    ).lastInsertRowid
  );

  const scheduleSourceFile = relativeToRoot(schedulePath);
  const examSourceFile = relativeToRoot(examPath);

  const insertSchedule = db.prepare(`
    INSERT INTO yedion_search_schedule_rows (
      academic_year_value, search_semester_value, search_semester_text,
      source_row_index, semester_period, course_code, course_name, section_type,
      group_label, day_of_week, start_time, end_time, lecturer_name, room,
      raw_text, raw_cells_json, raw_json, source_file, import_run_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_file, search_semester_value, source_row_index) DO UPDATE SET
      academic_year_value = excluded.academic_year_value,
      search_semester_text = excluded.search_semester_text,
      semester_period = excluded.semester_period,
      course_code = excluded.course_code,
      course_name = excluded.course_name,
      section_type = excluded.section_type,
      group_label = excluded.group_label,
      day_of_week = excluded.day_of_week,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      lecturer_name = excluded.lecturer_name,
      room = excluded.room,
      raw_text = excluded.raw_text,
      raw_cells_json = excluded.raw_cells_json,
      raw_json = excluded.raw_json,
      import_run_id = excluded.import_run_id,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertExam = db.prepare(`
    INSERT INTO yedion_search_exams (
      academic_year_value, course_code, course_name, semester_period,
      exam_date, exam_time, term_label, term_labels_json, term_number,
      term_numbers_json, subject_type, subject_types_json, lecturer_name,
      lecturer_names_json, merged_source_rows, row_indexes_json, raw_json,
      source_file, import_run_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(course_code, semester_period, exam_date, exam_time) DO UPDATE SET
      academic_year_value = excluded.academic_year_value,
      course_name = excluded.course_name,
      term_label = excluded.term_label,
      term_labels_json = excluded.term_labels_json,
      term_number = excluded.term_number,
      term_numbers_json = excluded.term_numbers_json,
      subject_type = excluded.subject_type,
      subject_types_json = excluded.subject_types_json,
      lecturer_name = excluded.lecturer_name,
      lecturer_names_json = excluded.lecturer_names_json,
      merged_source_rows = excluded.merged_source_rows,
      row_indexes_json = excluded.row_indexes_json,
      raw_json = excluded.raw_json,
      source_file = excluded.source_file,
      import_run_id = excluded.import_run_id,
      updated_at = CURRENT_TIMESTAMP
  `);

  let scheduleRows = 0;
  for (const row of scheduleData.rows ?? []) {
    insertSchedule.run(
      scheduleData.query?.academicYearValue ?? "2026",
      row.searchSemesterValue ?? null,
      row.searchSemesterText ?? null,
      normalizeNumber(row.rowIndex),
      normalizeText(row.semester),
      normalizeText(row.courseCode),
      normalizeText(row.courseName),
      normalizeText(row.subjectType),
      normalizeText(row.group),
      normalizeText(row.dayOfWeek),
      normalizeText(row.startTime),
      normalizeText(row.endTime),
      normalizeText(row.lecturerName),
      normalizeText(row.room),
      normalizeText(row.rawText),
      stringify(row.rawCells ?? []),
      stringify(row),
      scheduleSourceFile,
      runId
    );
    scheduleRows += 1;
  }

  let examRows = 0;
  for (const exam of examData.exams ?? []) {
    insertExam.run(
      exam.academicYearValue ?? "2026",
      exam.courseCode,
      normalizeText(exam.courseName),
      normalizeText(exam.semester),
      exam.examDate,
      normalizeText(exam.examTime),
      normalizeText(exam.termLabel),
      stringify(exam.termLabels ?? []),
      normalizeNumber(exam.termNumber),
      stringify(exam.termNumbers ?? []),
      normalizeText(exam.subjectType),
      stringify(exam.subjectTypes ?? []),
      normalizeText(exam.lecturerName),
      stringify(exam.lecturerNames ?? []),
      normalizeNumber(exam.mergedSourceRows) ?? 1,
      stringify(exam.rowIndexes ?? []),
      stringify(exam),
      examSourceFile,
      runId
    );
    examRows += 1;
  }

  return {
    runId,
    scheduleRows,
    examRows,
    dbScheduleRows: db.prepare("SELECT COUNT(*) AS value FROM yedion_search_schedule_rows").get().value,
    dbExamRows: db.prepare("SELECT COUNT(*) AS value FROM yedion_search_exams").get().value,
  };
});

const summary = importSearchResults();
db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      dbPath,
      schedulePath,
      examPath,
      ...summary,
    },
    null,
    2
  )
);
