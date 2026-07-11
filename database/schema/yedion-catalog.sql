PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS yedion_import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_year TEXT,
  base_url TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  options_json TEXT NOT NULL DEFAULT '{}',
  stats_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yedion_courses (
  course_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  taught_status TEXT,
  first_letter TEXT,
  academic_year_label TEXT,
  credits REAL,
  semester_hours REAL,
  syllabus_url TEXT,
  syllabus_text TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  first_seen_run_id INTEGER,
  last_seen_run_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (first_seen_run_id) REFERENCES yedion_import_runs(id),
  FOREIGN KEY (last_seen_run_id) REFERENCES yedion_import_runs(id)
);

CREATE TABLE IF NOT EXISTS yedion_course_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_key TEXT NOT NULL UNIQUE,
  course_code TEXT NOT NULL,
  academic_year_label TEXT,
  semester_code TEXT,
  semester_period TEXT,
  section_type_code TEXT,
  section_type TEXT NOT NULL,
  group_code TEXT,
  group_number TEXT,
  lecturer_name TEXT,
  is_full INTEGER NOT NULL DEFAULT 0,
  is_blocked_for_registration INTEGER NOT NULL DEFAULT 0,
  teaching_language TEXT,
  note_text TEXT,
  credits REAL,
  semester_hours REAL,
  linked_groups_json TEXT NOT NULL DEFAULT '[]',
  raw_arguments TEXT,
  detail_url TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  first_seen_run_id INTEGER,
  last_seen_run_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_code) REFERENCES yedion_courses(course_code) ON DELETE CASCADE,
  FOREIGN KEY (first_seen_run_id) REFERENCES yedion_import_runs(id),
  FOREIGN KEY (last_seen_run_id) REFERENCES yedion_import_runs(id)
);

CREATE TABLE IF NOT EXISTS yedion_section_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  course_code TEXT NOT NULL,
  semester_period TEXT,
  day_of_week TEXT,
  start_time TEXT,
  end_time TEXT,
  lecturer_name TEXT,
  room TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES yedion_course_sections(id) ON DELETE CASCADE,
  FOREIGN KEY (course_code) REFERENCES yedion_courses(course_code) ON DELETE CASCADE,
  UNIQUE (section_id, semester_period, day_of_week, start_time, end_time, room)
);

CREATE TABLE IF NOT EXISTS yedion_exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT NOT NULL,
  section_id INTEGER,
  term_label TEXT,
  exam_kind TEXT,
  exam_type TEXT,
  exam_date TEXT,
  exam_time TEXT,
  raw_text TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_code) REFERENCES yedion_courses(course_code) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES yedion_course_sections(id) ON DELETE CASCADE,
  UNIQUE (course_code, section_id, term_label, exam_kind, exam_date, exam_time)
);

CREATE TABLE IF NOT EXISTS yedion_syllabi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT NOT NULL,
  academic_year_label TEXT,
  syllabus_url TEXT,
  local_path TEXT,
  syllabus_text TEXT,
  source_type TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_code) REFERENCES yedion_courses(course_code) ON DELETE CASCADE,
  UNIQUE (course_code, syllabus_url)
);

CREATE TABLE IF NOT EXISTS yedion_section_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  course_code TEXT NOT NULL,
  link_kind TEXT,
  linked_course_code TEXT,
  linked_course_name TEXT,
  linked_section_type TEXT,
  day_time_text TEXT,
  lecturer_name TEXT,
  detail_arguments TEXT,
  detail_url TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES yedion_course_sections(id) ON DELETE CASCADE,
  FOREIGN KEY (course_code) REFERENCES yedion_courses(course_code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS yedion_course_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT NOT NULL,
  section_id INTEGER,
  relation_title TEXT,
  relation_type TEXT,
  population TEXT,
  related_course_code TEXT,
  alternative_group TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_code) REFERENCES yedion_courses(course_code) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES yedion_course_sections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS yedion_lecturers (
  lecturer_name TEXT PRIMARY KEY,
  first_seen_run_id INTEGER,
  last_seen_run_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (first_seen_run_id) REFERENCES yedion_import_runs(id),
  FOREIGN KEY (last_seen_run_id) REFERENCES yedion_import_runs(id)
);

CREATE TABLE IF NOT EXISTS yedion_rooms (
  room TEXT PRIMARY KEY,
  first_seen_run_id INTEGER,
  last_seen_run_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (first_seen_run_id) REFERENCES yedion_import_runs(id),
  FOREIGN KEY (last_seen_run_id) REFERENCES yedion_import_runs(id)
);

CREATE TABLE IF NOT EXISTS yedion_groups (
  group_code TEXT PRIMARY KEY,
  label TEXT,
  major_code TEXT,
  major_name TEXT,
  academic_year_label TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  first_seen_run_id INTEGER,
  last_seen_run_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (first_seen_run_id) REFERENCES yedion_import_runs(id),
  FOREIGN KEY (last_seen_run_id) REFERENCES yedion_import_runs(id)
);

CREATE TABLE IF NOT EXISTS yedion_group_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_code TEXT NOT NULL,
  course_code TEXT,
  course_name TEXT,
  semester_period TEXT,
  section_type TEXT,
  day_of_week TEXT,
  start_time TEXT,
  end_time TEXT,
  lecturer_name TEXT,
  room TEXT,
  raw_text TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_code) REFERENCES yedion_groups(group_code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS yedion_search_schedule_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_value TEXT,
  search_semester_value TEXT NOT NULL,
  search_semester_text TEXT,
  source_row_index INTEGER NOT NULL,
  semester_period TEXT,
  course_code TEXT,
  course_name TEXT,
  section_type TEXT,
  group_label TEXT,
  day_of_week TEXT,
  start_time TEXT,
  end_time TEXT,
  lecturer_name TEXT,
  room TEXT,
  raw_text TEXT,
  raw_cells_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL DEFAULT '{}',
  source_file TEXT NOT NULL,
  import_run_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_run_id) REFERENCES yedion_import_runs(id),
  UNIQUE (source_file, search_semester_value, source_row_index)
);

CREATE TABLE IF NOT EXISTS yedion_search_exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_value TEXT,
  course_code TEXT NOT NULL,
  course_name TEXT,
  semester_period TEXT,
  exam_date TEXT NOT NULL,
  exam_time TEXT,
  term_label TEXT,
  term_labels_json TEXT NOT NULL DEFAULT '[]',
  term_number INTEGER,
  term_numbers_json TEXT NOT NULL DEFAULT '[]',
  subject_type TEXT,
  subject_types_json TEXT NOT NULL DEFAULT '[]',
  lecturer_name TEXT,
  lecturer_names_json TEXT NOT NULL DEFAULT '[]',
  merged_source_rows INTEGER NOT NULL DEFAULT 1,
  row_indexes_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL DEFAULT '{}',
  source_file TEXT NOT NULL,
  import_run_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_run_id) REFERENCES yedion_import_runs(id),
  UNIQUE (course_code, semester_period, exam_date, exam_time)
);

CREATE INDEX IF NOT EXISTS idx_yedion_courses_name ON yedion_courses(name);
CREATE INDEX IF NOT EXISTS idx_yedion_sections_course ON yedion_course_sections(course_code);
CREATE INDEX IF NOT EXISTS idx_yedion_sections_semester ON yedion_course_sections(semester_period);
CREATE INDEX IF NOT EXISTS idx_yedion_sections_group ON yedion_course_sections(group_code);
CREATE INDEX IF NOT EXISTS idx_yedion_sections_type ON yedion_course_sections(section_type);
CREATE INDEX IF NOT EXISTS idx_yedion_meetings_time ON yedion_section_meetings(day_of_week, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_yedion_meetings_room ON yedion_section_meetings(room);
CREATE INDEX IF NOT EXISTS idx_yedion_meetings_room_time ON yedion_section_meetings(room, semester_period, day_of_week, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_yedion_meetings_lecturer_time ON yedion_section_meetings(lecturer_name, semester_period, day_of_week, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_yedion_exams_course ON yedion_exams(course_code);
CREATE INDEX IF NOT EXISTS idx_yedion_links_source ON yedion_section_links(section_id);
CREATE INDEX IF NOT EXISTS idx_yedion_links_target ON yedion_section_links(linked_course_code, linked_section_type);
CREATE INDEX IF NOT EXISTS idx_yedion_links_detail_arguments ON yedion_section_links(detail_arguments);
CREATE INDEX IF NOT EXISTS idx_yedion_relations_source ON yedion_course_relations(course_code);
CREATE INDEX IF NOT EXISTS idx_yedion_relations_target ON yedion_course_relations(related_course_code);
CREATE INDEX IF NOT EXISTS idx_yedion_search_schedule_course ON yedion_search_schedule_rows(course_code);
CREATE INDEX IF NOT EXISTS idx_yedion_search_schedule_time ON yedion_search_schedule_rows(semester_period, day_of_week, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_yedion_search_schedule_lecturer_time ON yedion_search_schedule_rows(lecturer_name, semester_period, day_of_week, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_yedion_search_exams_course ON yedion_search_exams(course_code);
CREATE INDEX IF NOT EXISTS idx_yedion_search_exams_date ON yedion_search_exams(exam_date, exam_time);

DROP VIEW IF EXISTS yedion_timetable_items;
CREATE VIEW yedion_timetable_items AS
SELECT
  c.course_code,
  c.name AS course_name,
  s.id AS section_id,
  s.section_key,
  s.semester_period,
  CASE s.semester_period
    WHEN 'א' THEN 1
    WHEN 'ב' THEN 2
    WHEN 'ג' THEN 3
    ELSE NULL
  END AS semester_index,
  s.section_type,
  s.group_code,
  s.group_number,
  s.lecturer_name AS section_lecturer_name,
  s.is_full,
  s.is_blocked_for_registration,
  s.teaching_language,
  s.note_text,
  m.day_of_week,
  m.start_time,
  m.end_time,
  m.lecturer_name AS meeting_lecturer_name,
  m.room,
  s.detail_url
FROM yedion_courses c
JOIN yedion_course_sections s ON s.course_code = c.course_code
LEFT JOIN yedion_section_meetings m ON m.section_id = s.id;

DROP VIEW IF EXISTS yedion_exam_items;
CREATE VIEW yedion_exam_items AS
SELECT
  c.course_code,
  c.name AS course_name,
  s.section_key,
  s.section_type,
  s.group_code,
  s.group_number,
  e.term_label,
  e.exam_kind,
  e.exam_type,
  e.exam_date,
  e.exam_time,
  e.raw_text
FROM yedion_exams e
JOIN yedion_courses c ON c.course_code = e.course_code
LEFT JOIN yedion_course_sections s ON s.id = e.section_id;

DROP VIEW IF EXISTS yedion_search_timetable_items;
CREATE VIEW yedion_search_timetable_items AS
SELECT
  row.id,
  row.academic_year_value,
  row.search_semester_value,
  row.search_semester_text,
  row.semester_period,
  CASE row.semester_period
    WHEN '×' THEN 1
    WHEN '×‘' THEN 2
    WHEN '×’' THEN 3
    ELSE NULL
  END AS semester_index,
  row.course_code,
  COALESCE(c.name, row.course_name) AS course_name,
  row.section_type,
  row.group_label,
  row.day_of_week,
  row.start_time,
  row.end_time,
  row.lecturer_name,
  row.room,
  row.raw_text,
  row.source_file
FROM yedion_search_schedule_rows row
LEFT JOIN yedion_courses c ON c.course_code = row.course_code;

DROP VIEW IF EXISTS yedion_search_exam_items;
CREATE VIEW yedion_search_exam_items AS
SELECT
  e.id,
  e.academic_year_value,
  e.course_code,
  COALESCE(c.name, e.course_name) AS course_name,
  e.semester_period,
  CASE e.semester_period
    WHEN '×' THEN 1
    WHEN '×‘' THEN 2
    WHEN '×’' THEN 3
    ELSE NULL
  END AS semester_index,
  e.exam_date,
  e.exam_time,
  e.term_label,
  e.term_labels_json,
  e.subject_type,
  e.subject_types_json,
  e.lecturer_name,
  e.lecturer_names_json,
  e.merged_source_rows,
  e.source_file
FROM yedion_search_exams e
LEFT JOIN yedion_courses c ON c.course_code = e.course_code;

DROP VIEW IF EXISTS yedion_course_import_status;
CREATE VIEW yedion_course_import_status AS
SELECT
  c.course_code,
  c.name,
  c.first_letter,
  c.taught_status,
  COUNT(DISTINCT s.id) AS section_count,
  COUNT(DISTINCT CASE WHEN s.raw_json LIKE '%"details":%' THEN s.id END) AS detailed_section_count,
  COUNT(DISTINCT m.id) AS meeting_count,
  COUNT(DISTINCT e.id) AS exam_count,
  CASE WHEN c.syllabus_url IS NOT NULL OR EXISTS (
    SELECT 1 FROM yedion_syllabi sy WHERE sy.course_code = c.course_code
  ) THEN 1 ELSE 0 END AS has_syllabus,
  c.updated_at
FROM yedion_courses c
LEFT JOIN yedion_course_sections s ON s.course_code = c.course_code
LEFT JOIN yedion_section_meetings m ON m.section_id = s.id
LEFT JOIN yedion_exams e ON e.section_id = s.id
GROUP BY c.course_code;

DROP VIEW IF EXISTS yedion_detail_queue;
CREATE VIEW yedion_detail_queue AS
SELECT
  s.course_code,
  c.name AS course_name,
  s.section_key,
  s.section_type,
  s.group_code,
  s.group_number,
  s.raw_arguments,
  s.detail_url
FROM yedion_course_sections s
JOIN yedion_courses c ON c.course_code = s.course_code
WHERE s.detail_url IS NOT NULL
  AND s.raw_json NOT LIKE '%"details":%'
ORDER BY s.course_code, s.semester_code, s.section_type_code, s.group_code, s.group_number;

DROP VIEW IF EXISTS yedion_section_required_options;
CREATE VIEW yedion_section_required_options AS
SELECT
  sl.id AS link_id,
  sl.course_code,
  c.name AS course_name,
  source.id AS source_section_id,
  source.section_key AS source_section_key,
  source.section_type AS source_section_type,
  source.semester_period AS source_semester_period,
  source.group_code AS source_group_code,
  source.group_number AS source_group_number,
  sl.link_kind,
  sl.linked_course_code AS required_course_code,
  sl.linked_course_name AS required_course_name,
  sl.linked_section_type AS required_section_type,
  target.id AS required_section_id,
  target.section_key AS required_section_key,
  target.semester_period AS required_semester_period,
  target.group_code AS required_group_code,
  target.group_number AS required_group_number,
  COALESCE(target.lecturer_name, sl.lecturer_name) AS required_lecturer_name,
  tm.day_of_week AS required_day_of_week,
  tm.start_time AS required_start_time,
  tm.end_time AS required_end_time,
  COALESCE(tm.room, sl.day_time_text) AS required_room_or_time_text,
  sl.day_time_text,
  sl.detail_arguments,
  sl.detail_url
FROM yedion_section_links sl
JOIN yedion_course_sections source ON source.id = sl.section_id
JOIN yedion_courses c ON c.course_code = sl.course_code
LEFT JOIN yedion_course_sections target
  ON target.course_code = sl.linked_course_code
  AND (
    (sl.detail_arguments IS NOT NULL AND target.raw_arguments = sl.detail_arguments)
    OR (sl.detail_url IS NOT NULL AND target.detail_url = sl.detail_url)
  )
LEFT JOIN yedion_section_meetings tm ON tm.section_id = target.id;

DROP VIEW IF EXISTS yedion_course_required_component_types;
CREATE VIEW yedion_course_required_component_types AS
SELECT
  course_code,
  course_name,
  source_section_type,
  required_section_type,
  COUNT(DISTINCT source_section_id) AS source_section_count,
  COUNT(DISTINCT COALESCE(required_section_key, detail_arguments, day_time_text)) AS option_count
FROM yedion_section_required_options
GROUP BY course_code, source_section_type, required_section_type;

DROP VIEW IF EXISTS yedion_course_dependency_edges;
CREATE VIEW yedion_course_dependency_edges AS
WITH normalized AS (
  SELECT
    cr.*,
    CASE
      WHEN cr.related_course_code IS NULL THEN NULL
      WHEN instr(trim(cr.related_course_code), ' ') > 0
        THEN substr(trim(cr.related_course_code), 1, instr(trim(cr.related_course_code), ' ') - 1)
      ELSE trim(cr.related_course_code)
    END AS normalized_related_course_code
  FROM yedion_course_relations cr
)
SELECT
  n.id AS relation_id,
  n.course_code AS course_code,
  source.name AS course_name,
  n.section_id,
  s.section_key,
  s.section_type,
  CASE
    WHEN COALESCE(n.relation_title, '') || ' ' || COALESCE(n.relation_type, '') LIKE '%קדם%' THEN 'prerequisite'
    WHEN COALESCE(n.relation_title, '') || ' ' || COALESCE(n.relation_type, '') LIKE '%צמוד%' THEN 'corequisite'
    WHEN COALESCE(n.relation_title, '') || ' ' || COALESCE(n.relation_type, '') LIKE '%מקביל%' THEN 'corequisite'
    ELSE 'relation'
  END AS dependency_kind,
  n.relation_title,
  n.relation_type,
  n.population,
  n.normalized_related_course_code AS required_course_code,
  target.name AS required_course_name,
  n.related_course_code AS required_course_raw,
  n.alternative_group,
  n.raw_json
FROM normalized n
JOIN yedion_courses source ON source.course_code = n.course_code
LEFT JOIN yedion_course_sections s ON s.id = n.section_id
LEFT JOIN yedion_courses target ON target.course_code = n.normalized_related_course_code;

DROP VIEW IF EXISTS yedion_room_busy_windows;
CREATE VIEW yedion_room_busy_windows AS
SELECT
  m.id AS meeting_id,
  m.room,
  m.semester_period,
  CASE m.semester_period
    WHEN 'א' THEN 1
    WHEN 'ב' THEN 2
    WHEN 'ג' THEN 3
    ELSE NULL
  END AS semester_index,
  CASE m.day_of_week
    WHEN 'א' THEN 'יום ראשון'
    WHEN 'ב' THEN 'יום שני'
    WHEN 'ג' THEN 'יום שלישי'
    WHEN 'ד' THEN 'יום רביעי'
    WHEN 'ה' THEN 'יום חמישי'
    WHEN 'ו' THEN 'יום שישי'
    ELSE m.day_of_week
  END AS day_name,
  CASE m.day_of_week
    WHEN 'יום ראשון' THEN 1
    WHEN 'א' THEN 1
    WHEN 'יום שני' THEN 2
    WHEN 'ב' THEN 2
    WHEN 'יום שלישי' THEN 3
    WHEN 'ג' THEN 3
    WHEN 'יום רביעי' THEN 4
    WHEN 'ד' THEN 4
    WHEN 'יום חמישי' THEN 5
    WHEN 'ה' THEN 5
    WHEN 'יום שישי' THEN 6
    WHEN 'ו' THEN 6
    ELSE NULL
  END AS day_index,
  m.start_time,
  m.end_time,
  CASE
    WHEN m.start_time LIKE '__:__'
      THEN CAST(substr(m.start_time, 1, 2) AS INTEGER) * 60 + CAST(substr(m.start_time, 4, 2) AS INTEGER)
    ELSE NULL
  END AS start_minutes,
  CASE
    WHEN m.end_time LIKE '__:__'
      THEN CAST(substr(m.end_time, 1, 2) AS INTEGER) * 60 + CAST(substr(m.end_time, 4, 2) AS INTEGER)
    ELSE NULL
  END AS end_minutes,
  c.course_code,
  c.name AS course_name,
  s.id AS section_id,
  s.section_key,
  s.section_type,
  s.group_code,
  s.group_number,
  COALESCE(m.lecturer_name, s.lecturer_name) AS lecturer_name
FROM yedion_section_meetings m
JOIN yedion_course_sections s ON s.id = m.section_id
JOIN yedion_courses c ON c.course_code = m.course_code
WHERE m.room IS NOT NULL AND trim(m.room) <> '';

DROP VIEW IF EXISTS yedion_lecturer_busy_windows;
CREATE VIEW yedion_lecturer_busy_windows AS
SELECT
  m.id AS meeting_id,
  COALESCE(m.lecturer_name, s.lecturer_name) AS lecturer_name,
  m.semester_period,
  CASE m.semester_period
    WHEN 'א' THEN 1
    WHEN 'ב' THEN 2
    WHEN 'ג' THEN 3
    ELSE NULL
  END AS semester_index,
  CASE m.day_of_week
    WHEN 'א' THEN 'יום ראשון'
    WHEN 'ב' THEN 'יום שני'
    WHEN 'ג' THEN 'יום שלישי'
    WHEN 'ד' THEN 'יום רביעי'
    WHEN 'ה' THEN 'יום חמישי'
    WHEN 'ו' THEN 'יום שישי'
    ELSE m.day_of_week
  END AS day_name,
  CASE m.day_of_week
    WHEN 'יום ראשון' THEN 1
    WHEN 'א' THEN 1
    WHEN 'יום שני' THEN 2
    WHEN 'ב' THEN 2
    WHEN 'יום שלישי' THEN 3
    WHEN 'ג' THEN 3
    WHEN 'יום רביעי' THEN 4
    WHEN 'ד' THEN 4
    WHEN 'יום חמישי' THEN 5
    WHEN 'ה' THEN 5
    WHEN 'יום שישי' THEN 6
    WHEN 'ו' THEN 6
    ELSE NULL
  END AS day_index,
  m.start_time,
  m.end_time,
  CASE
    WHEN m.start_time LIKE '__:__'
      THEN CAST(substr(m.start_time, 1, 2) AS INTEGER) * 60 + CAST(substr(m.start_time, 4, 2) AS INTEGER)
    ELSE NULL
  END AS start_minutes,
  CASE
    WHEN m.end_time LIKE '__:__'
      THEN CAST(substr(m.end_time, 1, 2) AS INTEGER) * 60 + CAST(substr(m.end_time, 4, 2) AS INTEGER)
    ELSE NULL
  END AS end_minutes,
  c.course_code,
  c.name AS course_name,
  s.id AS section_id,
  s.section_key,
  s.section_type,
  s.group_code,
  s.group_number,
  m.room
FROM yedion_section_meetings m
JOIN yedion_course_sections s ON s.id = m.section_id
JOIN yedion_courses c ON c.course_code = m.course_code
WHERE COALESCE(m.lecturer_name, s.lecturer_name) IS NOT NULL
  AND trim(COALESCE(m.lecturer_name, s.lecturer_name)) <> '';

-- Canonical, non-destructive read models for the timetable application.
-- Imported tables intentionally retain groups whose time is not published yet.
DROP VIEW IF EXISTS yedion_section_schedule_quality;
CREATE VIEW yedion_section_schedule_quality AS
WITH meeting_quality AS (
  SELECT
    s.id AS section_id,
    COUNT(m.id) AS meeting_count,
    SUM(
      CASE
        WHEN trim(COALESCE(m.day_of_week, '')) <> ''
          AND m.start_time GLOB '[0-2][0-9]:[0-5][0-9]'
          AND m.end_time GLOB '[0-2][0-9]:[0-5][0-9]'
          AND m.start_time < m.end_time
          THEN 1
        ELSE 0
      END
    ) AS scheduled_meeting_count
  FROM yedion_course_sections s
  LEFT JOIN yedion_section_meetings m ON m.section_id = s.id
  GROUP BY s.id
)
SELECT
  s.id AS section_id,
  s.course_code,
  c.name AS course_name,
  s.academic_year_label,
  s.semester_code,
  s.semester_period,
  s.section_type,
  s.group_code,
  s.group_number,
  s.is_full,
  s.is_blocked_for_registration,
  mq.meeting_count,
  COALESCE(mq.scheduled_meeting_count, 0) AS scheduled_meeting_count,
  CASE
    WHEN COALESCE(mq.scheduled_meeting_count, 0) > 0 THEN 'scheduled'
    WHEN COALESCE(mq.meeting_count, 0) > 0 THEN 'time-unpublished'
    ELSE 'no-meetings'
  END AS schedule_status,
  CASE WHEN s.raw_json LIKE '%"details":%' THEN 1 ELSE 0 END AS has_details
FROM yedion_course_sections s
JOIN yedion_courses c ON c.course_code = s.course_code
LEFT JOIN meeting_quality mq ON mq.section_id = s.id;

DROP VIEW IF EXISTS yedion_section_link_resolution;
CREATE VIEW yedion_section_link_resolution AS
SELECT
  l.id AS link_id,
  l.section_id AS source_section_id,
  l.course_code,
  l.link_kind,
  l.linked_course_code AS required_course_code,
  l.linked_course_name AS required_course_name,
  l.linked_section_type AS required_section_type,
  l.detail_arguments,
  l.detail_url,
  target.id AS required_section_id,
  target.section_key AS required_section_key,
  CASE WHEN target.id IS NULL THEN 'unresolved' ELSE 'resolved' END AS resolution_status
FROM yedion_section_links l
LEFT JOIN yedion_course_sections target
  ON target.course_code = l.linked_course_code
  AND (
    (l.detail_arguments IS NOT NULL AND target.raw_arguments = l.detail_arguments)
    OR (l.detail_url IS NOT NULL AND target.detail_url = l.detail_url)
  );

DROP VIEW IF EXISTS yedion_exam_slots;
CREATE VIEW yedion_exam_slots AS
WITH raw_exams AS (
  SELECT
    'detail' AS source_kind,
    e.course_code,
    c.name AS course_name,
    COALESCE(s.semester_period, '') AS semester_period,
    e.exam_date,
    COALESCE(e.exam_time, '') AS exam_time,
    e.term_label,
    e.exam_kind,
    e.exam_type,
    COALESCE(s.lecturer_name, '') AS lecturer_name,
    s.id AS section_id,
    e.id AS source_exam_id
  FROM yedion_exams e
  JOIN yedion_courses c ON c.course_code = e.course_code
  LEFT JOIN yedion_course_sections s ON s.id = e.section_id
  WHERE e.exam_date IS NOT NULL

  UNION ALL

  SELECT
    'search' AS source_kind,
    e.course_code,
    COALESCE(c.name, e.course_name) AS course_name,
    COALESCE(e.semester_period, '') AS semester_period,
    e.exam_date,
    COALESCE(e.exam_time, '') AS exam_time,
    e.term_label,
    e.subject_type AS exam_kind,
    NULL AS exam_type,
    COALESCE(e.lecturer_name, '') AS lecturer_name,
    NULL AS section_id,
    e.id AS source_exam_id
  FROM yedion_search_exams e
  LEFT JOIN yedion_courses c ON c.course_code = e.course_code
)
SELECT
  course_code,
  MAX(course_name) AS course_name,
  semester_period,
  exam_date,
  NULLIF(exam_time, '') AS exam_time,
  group_concat(DISTINCT NULLIF(term_label, '')) AS term_labels,
  group_concat(DISTINCT NULLIF(exam_kind, '')) AS exam_kinds,
  group_concat(DISTINCT NULLIF(exam_type, '')) AS exam_types,
  group_concat(DISTINCT NULLIF(lecturer_name, '')) AS lecturer_names,
  group_concat(DISTINCT section_id) AS section_ids,
  group_concat(DISTINCT source_kind) AS source_kinds,
  COUNT(*) AS source_rows
FROM raw_exams
GROUP BY course_code, semester_period, exam_date, exam_time;

DROP VIEW IF EXISTS yedion_dependency_resolution;
CREATE VIEW yedion_dependency_resolution AS
WITH normalized AS (
  SELECT
    cr.*,
    trim(COALESCE(cr.related_course_code, '')) AS required_course_label,
    CASE
      WHEN trim(COALESCE(cr.related_course_code, '')) <> ''
        AND trim(cr.related_course_code) NOT GLOB '*[^0-9]*'
        THEN trim(cr.related_course_code)
      ELSE NULL
    END AS required_course_code
  FROM yedion_course_relations cr
)
SELECT
  n.id AS relation_id,
  n.course_code,
  source.name AS course_name,
  n.section_id,
  n.relation_title,
  n.relation_type,
  n.population,
  CASE
    WHEN instr(COALESCE(n.relation_type, ''), char(1510,1502,1493,1491)) > 0
      OR instr(COALESCE(n.relation_type, ''), char(1502,1511,1489,1497,1500)) > 0
      THEN 'corequisite'
    WHEN instr(COALESCE(n.relation_type, '') || COALESCE(n.relation_title, ''), char(1511,1491,1501)) > 0
      THEN 'prerequisite'
    ELSE 'relation'
  END AS dependency_kind,
  n.required_course_code,
  n.required_course_label,
  target.name AS required_course_name,
  n.alternative_group
FROM normalized n
JOIN yedion_courses source ON source.course_code = n.course_code
LEFT JOIN yedion_courses target ON target.course_code = n.required_course_code;
