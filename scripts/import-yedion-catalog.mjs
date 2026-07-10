import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const rootDir = process.cwd();
const dbPath = process.env.DEGREE_DB_PATH ?? path.join(rootDir, "data", "degree-planner.sqlite");
const defaultInputPath = path.join(rootDir, "data", "yedion", "catalog.json");
const schemaPath = path.join(rootDir, "database", "schema", "yedion-catalog.sql");

function readArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const inputPath = path.resolve(readArg("--input", defaultInputPath));
const shouldReset = process.argv.includes("--reset-yedion");

function stringify(value) {
  return JSON.stringify(value ?? {});
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function findCourseDetail(course) {
  return (course.sections ?? []).map((section) => section.details).find(Boolean) ?? null;
}

function runImport(db, catalog) {
  const startedAt = catalog.source?.startedAt ?? new Date().toISOString();
  const finishedAt = catalog.source?.finishedAt ?? new Date().toISOString();
  const sourceYear = catalog.source?.academicYearLabel ?? catalog.source?.sourceYear ?? null;
  const baseUrl = catalog.source?.baseUrl ?? "https://info.braude.ac.il/yedion/fireflyweb.aspx";
  const optionsJson = stringify(catalog.options ?? {});
  const statsJson = stringify(catalog.stats ?? {});

  const insertRun = db.prepare(`
    INSERT INTO yedion_import_runs (
      source_year, base_url, started_at, finished_at, status, options_json, stats_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const runId = Number(
    insertRun.run(sourceYear, baseUrl, startedAt, finishedAt, "imported", optionsJson, statsJson)
      .lastInsertRowid
  );

  const upsertCourse = db.prepare(`
    INSERT INTO yedion_courses (
      course_code, name, taught_status, first_letter, academic_year_label, credits,
      semester_hours, syllabus_url, syllabus_text, raw_json, first_seen_run_id,
      last_seen_run_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(course_code) DO UPDATE SET
      name = excluded.name,
      taught_status = COALESCE(excluded.taught_status, yedion_courses.taught_status),
      first_letter = COALESCE(excluded.first_letter, yedion_courses.first_letter),
      academic_year_label = COALESCE(excluded.academic_year_label, yedion_courses.academic_year_label),
      credits = COALESCE(excluded.credits, yedion_courses.credits),
      semester_hours = COALESCE(excluded.semester_hours, yedion_courses.semester_hours),
      syllabus_url = COALESCE(excluded.syllabus_url, yedion_courses.syllabus_url),
      syllabus_text = COALESCE(excluded.syllabus_text, yedion_courses.syllabus_text),
      raw_json = excluded.raw_json,
      last_seen_run_id = excluded.last_seen_run_id,
      updated_at = CURRENT_TIMESTAMP
  `);

  const upsertSection = db.prepare(`
    INSERT INTO yedion_course_sections (
      section_key, course_code, academic_year_label, semester_code, semester_period,
      section_type_code, section_type, group_code, group_number, lecturer_name, is_full,
      is_blocked_for_registration, teaching_language, note_text, credits, semester_hours,
      linked_groups_json, raw_arguments,
      detail_url, raw_json, first_seen_run_id, last_seen_run_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(section_key) DO UPDATE SET
      academic_year_label = COALESCE(excluded.academic_year_label, yedion_course_sections.academic_year_label),
      semester_code = COALESCE(excluded.semester_code, yedion_course_sections.semester_code),
      semester_period = COALESCE(excluded.semester_period, yedion_course_sections.semester_period),
      section_type_code = COALESCE(excluded.section_type_code, yedion_course_sections.section_type_code),
      section_type = COALESCE(excluded.section_type, yedion_course_sections.section_type),
      group_code = COALESCE(excluded.group_code, yedion_course_sections.group_code),
      group_number = COALESCE(excluded.group_number, yedion_course_sections.group_number),
      lecturer_name = COALESCE(excluded.lecturer_name, yedion_course_sections.lecturer_name),
      is_full = excluded.is_full,
      is_blocked_for_registration = excluded.is_blocked_for_registration,
      teaching_language = COALESCE(excluded.teaching_language, yedion_course_sections.teaching_language),
      note_text = COALESCE(excluded.note_text, yedion_course_sections.note_text),
      credits = COALESCE(excluded.credits, yedion_course_sections.credits),
      semester_hours = COALESCE(excluded.semester_hours, yedion_course_sections.semester_hours),
      linked_groups_json = excluded.linked_groups_json,
      raw_arguments = COALESCE(excluded.raw_arguments, yedion_course_sections.raw_arguments),
      detail_url = COALESCE(excluded.detail_url, yedion_course_sections.detail_url),
      raw_json = excluded.raw_json,
      last_seen_run_id = excluded.last_seen_run_id,
      updated_at = CURRENT_TIMESTAMP
  `);

  const getSectionId = db.prepare("SELECT id FROM yedion_course_sections WHERE section_key = ?");
  const deleteMeetings = db.prepare("DELETE FROM yedion_section_meetings WHERE section_id = ?");
  const deleteExams = db.prepare("DELETE FROM yedion_exams WHERE section_id = ?");
  const deleteLinks = db.prepare("DELETE FROM yedion_section_links WHERE section_id = ?");
  const deleteRelations = db.prepare("DELETE FROM yedion_course_relations WHERE section_id = ?");

  const insertMeeting = db.prepare(`
    INSERT OR IGNORE INTO yedion_section_meetings (
      section_id, course_code, semester_period, day_of_week, start_time, end_time,
      lecturer_name, room, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const insertExam = db.prepare(`
    INSERT OR IGNORE INTO yedion_exams (
      course_code, section_id, term_label, exam_kind, exam_type, exam_date, exam_time,
      raw_text, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const upsertSyllabus = db.prepare(`
    INSERT INTO yedion_syllabi (
      course_code, academic_year_label, syllabus_url, local_path, syllabus_text,
      source_type, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(course_code, syllabus_url) DO UPDATE SET
      academic_year_label = COALESCE(excluded.academic_year_label, yedion_syllabi.academic_year_label),
      local_path = COALESCE(excluded.local_path, yedion_syllabi.local_path),
      syllabus_text = COALESCE(excluded.syllabus_text, yedion_syllabi.syllabus_text),
      source_type = COALESCE(excluded.source_type, yedion_syllabi.source_type),
      raw_json = excluded.raw_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertLink = db.prepare(`
    INSERT INTO yedion_section_links (
      section_id, course_code, link_kind, linked_course_code, linked_course_name,
      linked_section_type, day_time_text, lecturer_name, detail_arguments, detail_url,
      raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const insertRelation = db.prepare(`
    INSERT INTO yedion_course_relations (
      course_code, section_id, relation_title, relation_type, population,
      related_course_code, alternative_group, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const upsertLecturer = db.prepare(`
    INSERT INTO yedion_lecturers (lecturer_name, first_seen_run_id, last_seen_run_id, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(lecturer_name) DO UPDATE SET
      last_seen_run_id = excluded.last_seen_run_id,
      updated_at = CURRENT_TIMESTAMP
  `);

  const upsertRoom = db.prepare(`
    INSERT INTO yedion_rooms (room, first_seen_run_id, last_seen_run_id, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(room) DO UPDATE SET
      last_seen_run_id = excluded.last_seen_run_id,
      updated_at = CURRENT_TIMESTAMP
  `);

  const courses = Array.isArray(catalog.courses) ? catalog.courses : [];

  for (const course of courses) {
    const detail = findCourseDetail(course);
    const syllabusUrl = course.syllabusUrl ?? detail?.syllabusUrl ?? null;
    const syllabusText = course.syllabusText ?? detail?.syllabusText ?? null;
    const credits = course.credits ?? detail?.credits ?? null;
    const semesterHours = course.semesterHours ?? detail?.semesterHours ?? null;
    const academicYearLabel =
      course.academicYearLabel ?? detail?.academicYearLabel ?? catalog.source?.academicYearLabel ?? null;

    upsertCourse.run(
      course.courseCode,
      course.name ?? detail?.courseName ?? course.courseCode,
      course.taughtStatus ?? null,
      course.firstLetter ?? null,
      academicYearLabel,
      numberOrNull(credits),
      numberOrNull(semesterHours),
      syllabusUrl,
      syllabusText,
      stringify(course),
      runId,
      runId
    );

    if (syllabusUrl || syllabusText) {
      upsertSyllabus.run(
        course.courseCode,
        academicYearLabel,
        syllabusUrl ?? `inline:${course.courseCode}`,
        detail?.syllabusLocalPath ?? null,
        syllabusText,
        syllabusUrl ? path.extname(syllabusUrl).slice(1).toLowerCase() || null : "inline",
        stringify({ courseCode: course.courseCode, syllabusUrl, syllabusText })
      );
    }

    for (const section of course.sections ?? []) {
      const sectionDetail = section.details ?? {};
      const meetings = sectionDetail.meetings?.length ? sectionDetail.meetings : section.meetings ?? [];
      const semesterPeriod =
        section.semesterPeriod ?? sectionDetail.semesterPeriod ?? meetings.find((meeting) => meeting.semesterPeriod)?.semesterPeriod ?? null;
      const sectionKey =
        section.sectionKey ??
        [
          course.courseCode,
          section.semesterCode,
          section.sectionTypeCode,
          section.groupCode,
          section.groupNumber,
        ].join(":");

      upsertSection.run(
        sectionKey,
        course.courseCode,
        section.academicYearLabel ?? sectionDetail.academicYearLabel ?? academicYearLabel,
        section.semesterCode ?? sectionDetail.semesterCode ?? null,
        semesterPeriod,
        section.sectionTypeCode ?? sectionDetail.sectionTypeCode ?? null,
        section.sectionType ?? sectionDetail.sectionType ?? "לא ידוע",
        section.groupCode ?? sectionDetail.groupCode ?? null,
        section.groupNumber ?? sectionDetail.groupNumber ?? null,
        section.lecturerName ?? sectionDetail.lecturerName ?? null,
        section.isFull || sectionDetail.isFull ? 1 : 0,
        section.isBlockedForRegistration || sectionDetail.isBlockedForRegistration ? 1 : 0,
        section.teachingLanguage ?? sectionDetail.teachingLanguage ?? null,
        section.noteText ?? sectionDetail.noteText ?? null,
        numberOrNull(section.credits ?? sectionDetail.credits ?? credits),
        numberOrNull(section.semesterHours ?? sectionDetail.semesterHours ?? semesterHours),
        stringify(section.linkedGroups ?? []),
        section.rawArguments ?? sectionDetail.rawArguments ?? null,
        section.detailUrl ?? sectionDetail.detailUrl ?? null,
        stringify(section),
        runId,
        runId
      );

      const sectionId = getSectionId.get(sectionKey)?.id;
      if (!sectionId) {
        throw new Error(`Could not find imported section ${sectionKey}`);
      }

      deleteMeetings.run(sectionId);
      deleteExams.run(sectionId);
      deleteLinks.run(sectionId);
      deleteRelations.run(sectionId);

      for (const meeting of meetings) {
        const lecturer = normalizeText(meeting.lecturerName);
        const room = normalizeText(meeting.room);

        insertMeeting.run(
          sectionId,
          course.courseCode,
          meeting.semesterPeriod ?? semesterPeriod,
          meeting.dayOfWeek ?? null,
          meeting.startTime ?? null,
          meeting.endTime ?? null,
          lecturer,
          room,
          stringify(meeting)
        );

        if (lecturer) {
          upsertLecturer.run(lecturer, runId, runId);
        }
        if (room) {
          upsertRoom.run(room, runId, runId);
        }
      }

      const sectionLecturer = normalizeText(section.lecturerName ?? sectionDetail.lecturerName);
      if (sectionLecturer) {
        upsertLecturer.run(sectionLecturer, runId, runId);
      }

      for (const exam of sectionDetail.exams ?? []) {
        insertExam.run(
          course.courseCode,
          sectionId,
          exam.termLabel ?? null,
          exam.examKind ?? null,
          exam.examType ?? null,
          exam.examDate ?? null,
          exam.examTime ?? null,
          exam.rawText ?? null,
          stringify(exam)
        );
      }

      for (const link of sectionDetail.linkedSections ?? []) {
        insertLink.run(
          sectionId,
          course.courseCode,
          link.linkKind ?? null,
          link.linkedCourseCode ?? null,
          link.linkedCourseName ?? null,
          link.linkedSectionType ?? null,
          link.dayTimeText ?? null,
          link.lecturerName ?? null,
          link.detailArguments ?? null,
          link.detailUrl ?? null,
          stringify(link)
        );
      }

      for (const relation of sectionDetail.relations ?? []) {
        insertRelation.run(
          course.courseCode,
          sectionId,
          relation.relationTitle ?? null,
          relation.relationType ?? null,
          relation.population ?? null,
          relation.relatedCourseCode ?? null,
          relation.alternativeGroup ?? null,
          stringify(relation)
        );
      }
    }
  }

  return {
    runId,
    courses: db.prepare("SELECT COUNT(*) AS value FROM yedion_courses").get().value,
    sections: db.prepare("SELECT COUNT(*) AS value FROM yedion_course_sections").get().value,
    meetings: db.prepare("SELECT COUNT(*) AS value FROM yedion_section_meetings").get().value,
    exams: db.prepare("SELECT COUNT(*) AS value FROM yedion_exams").get().value,
    syllabi: db.prepare("SELECT COUNT(*) AS value FROM yedion_syllabi").get().value,
    lecturers: db.prepare("SELECT COUNT(*) AS value FROM yedion_lecturers").get().value,
    rooms: db.prepare("SELECT COUNT(*) AS value FROM yedion_rooms").get().value,
  };
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Yedion catalog JSON was not found: ${inputPath}`);
}

const catalog = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(schemaPath, "utf8"));
ensureColumn(db, "yedion_course_sections", "is_blocked_for_registration", "INTEGER NOT NULL DEFAULT 0");
ensureColumn(db, "yedion_course_sections", "note_text", "TEXT");

if (shouldReset) {
  db.exec(`
    DELETE FROM yedion_group_schedule_items;
    DELETE FROM yedion_groups;
    DELETE FROM yedion_course_relations;
    DELETE FROM yedion_section_links;
    DELETE FROM yedion_syllabi;
    DELETE FROM yedion_exams;
    DELETE FROM yedion_section_meetings;
    DELETE FROM yedion_course_sections;
    DELETE FROM yedion_rooms;
    DELETE FROM yedion_lecturers;
    DELETE FROM yedion_courses;
  `);
}

const importCatalog = db.transaction((payload) => runImport(db, payload));
const summary = importCatalog(catalog);
db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      dbPath,
      inputPath,
      ...summary,
    },
    null,
    2
  )
);
