import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const defaultInputPath = path.join(
  rootDir,
  "data",
  "yedion",
  "search",
  "exams-2026-empty-major-all-semesters.json"
);
const defaultOutputPath = path.join(
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

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniq(values) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? clean(value) : value))
        .filter((value) => value !== null && value !== undefined && value !== "")
    )
  );
}

function normalizeExamKey(exam) {
  return [
    clean(exam.courseCode),
    clean(exam.semester),
    clean(exam.examDate),
    clean(exam.examTime),
  ].join("|");
}

function mergeExamGroup(group) {
  const first = group[0];
  const lecturerNames = uniq(group.map((exam) => exam.lecturerName));
  const subjectTypes = uniq(group.map((exam) => exam.subjectType));
  const termLabels = uniq(group.map((exam) => exam.termLabel));
  const termNumbers = uniq(group.map((exam) => exam.termNumber));
  const rowIndexes = uniq(group.map((exam) => exam.rowIndex));

  return {
    source: first.source ?? "S_EXAMS",
    academicYearValue: first.academicYearValue ?? null,
    courseCode: clean(first.courseCode),
    courseName: clean(first.courseName),
    semester: clean(first.semester),
    examDate: first.examDate ?? null,
    examTime: first.examTime ?? null,
    examDateRaw: first.examDateRaw ?? null,
    examTimeRaw: first.examTimeRaw ?? null,
    termLabel: termLabels.length === 1 ? termLabels[0] : null,
    termLabels,
    termNumber: termNumbers.length === 1 ? termNumbers[0] : null,
    termNumbers,
    subjectType: subjectTypes.length === 1 ? subjectTypes[0] : null,
    subjectTypes,
    lecturerName: lecturerNames.join(" / "),
    lecturerNames,
    rowIndexes,
    mergedSourceRows: group.length,
  };
}

function sortExams(a, b) {
  return (
    String(a.semester).localeCompare(String(b.semester), "he") ||
    String(a.examDate).localeCompare(String(b.examDate)) ||
    String(a.examTime).localeCompare(String(b.examTime)) ||
    String(a.courseCode).localeCompare(String(b.courseCode), "he") ||
    String(a.termLabel ?? "").localeCompare(String(b.termLabel ?? ""), "he")
  );
}

const inputPath = path.resolve(readArg("--input", defaultInputPath));
const outputPath = path.resolve(readArg("--output", defaultOutputPath));

if (!fs.existsSync(inputPath)) {
  throw new Error(`Exam JSON was not found: ${inputPath}`);
}

const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const sourceExams = Array.isArray(input.exams) ? input.exams : [];
const groups = new Map();

for (const exam of sourceExams) {
  const key = normalizeExamKey(exam);
  const group = groups.get(key) ?? [];
  group.push(exam);
  groups.set(key, group);
}

const duplicateGroups = Array.from(groups.values()).filter((group) => group.length > 1);
const groupsWithMultipleLecturers = duplicateGroups.filter(
  (group) => uniq(group.map((exam) => exam.lecturerName)).length > 1
);
const exams = Array.from(groups.values()).map(mergeExamGroup).sort(sortExams);

const output = {
  sourceFile: path.relative(rootDir, inputPath),
  normalizedAt: new Date().toISOString(),
  query: input.query ?? null,
  rawStats: input.stats ?? null,
  stats: {
    sourceExamRows: sourceExams.length,
    exams: exams.length,
    duplicateGroups: duplicateGroups.length,
    duplicateRowsMerged: sourceExams.length - exams.length,
    groupsWithMultipleLecturers: groupsWithMultipleLecturers.length,
    uniqueCourses: uniq(exams.map((exam) => exam.courseCode)).length,
  },
  rows: input.rows ?? [],
  exams,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      inputPath,
      outputPath,
      ...output.stats,
    },
    null,
    2
  )
);
