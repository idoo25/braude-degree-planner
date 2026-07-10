import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const defaultDataDir = path.join(rootDir, "data", "yedion");
const defaultOutputPath = path.join(defaultDataDir, "catalog-current.json");

function readArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function collectInputPaths(outputPath) {
  const explicitInputs = process.argv.filter((arg) => arg.endsWith(".json") && !arg.startsWith("--"));
  if (explicitInputs.length) {
    return explicitInputs.map((input) => path.resolve(input));
  }

  if (!fs.existsSync(defaultDataDir)) {
    return [];
  }

  const directCatalogs = fs
    .readdirSync(defaultDataDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .filter((fileName) => !fileName.endsWith("catalog-current.json"))
    .map((fileName) => path.join(defaultDataDir, fileName))
    .filter((inputPath) => path.resolve(inputPath) !== path.resolve(outputPath));
  const backfillDir = path.join(defaultDataDir, "backfill");
  const backfillCatalogs = fs.existsSync(backfillDir)
    ? fs
        .readdirSync(backfillDir)
        .filter((fileName) => fileName.endsWith(".json"))
        .map((fileName) => path.join(backfillDir, fileName))
    : [];

  return [...directCatalogs, ...backfillCatalogs].sort();
}

function defined(value) {
  return value !== undefined && value !== null && value !== "";
}

function mergeDefined(base, incoming) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (defined(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

function detailScore(section) {
  const details = section?.details;
  if (!details) {
    return 0;
  }

  return (
    1 +
    (details.exams?.length ?? 0) +
    (details.linkedSections?.length ?? 0) +
    (details.relations?.length ?? 0) +
    (details.syllabusUrl ? 1 : 0) +
    (details.syllabusText ? 1 : 0)
  );
}

function mergeSections(existingSections = [], incomingSections = []) {
  const byKey = new Map();

  for (const section of existingSections) {
    const key = section.sectionKey ?? section.rawArguments;
    if (key) {
      byKey.set(key, section);
    }
  }

  for (const section of incomingSections) {
    const key = section.sectionKey ?? section.rawArguments;
    if (!key) {
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, section);
      continue;
    }

    const merged = mergeDefined(existing, section);
    const existingDetailScore = detailScore(existing);
    const incomingDetailScore = detailScore(section);
    merged.details = incomingDetailScore >= existingDetailScore ? section.details ?? existing.details : existing.details;
    merged.meetings =
      (section.meetings?.length ?? 0) >= (existing.meetings?.length ?? 0)
        ? section.meetings ?? existing.meetings
        : existing.meetings;
    byKey.set(key, merged);
  }

  return Array.from(byKey.values()).sort((a, b) =>
    (a.sectionKey ?? "").localeCompare(b.sectionKey ?? "", "he")
  );
}

function mergeCourses(existing, incoming) {
  const merged = mergeDefined(existing, incoming);
  const existingSections = existing.sections ?? [];
  const incomingSections = incoming.sections ?? [];
  merged.sections = mergeSections(existingSections, incomingSections);

  if (!merged.syllabusUrl) {
    merged.syllabusUrl =
      merged.sections.find((section) => section.details?.syllabusUrl)?.details?.syllabusUrl ?? null;
  }

  if (!merged.syllabusText) {
    merged.syllabusText =
      merged.sections.find((section) => section.details?.syllabusText)?.details?.syllabusText ?? null;
  }

  if (!defined(merged.credits)) {
    merged.credits = merged.sections.find((section) => defined(section.details?.credits))?.details?.credits ?? null;
  }

  if (!defined(merged.semesterHours)) {
    merged.semesterHours =
      merged.sections.find((section) => defined(section.details?.semesterHours))?.details?.semesterHours ?? null;
  }

  return merged;
}

function catalogStats(courses) {
  return {
    courses: courses.length,
    sections: courses.reduce((sum, course) => sum + (course.sections?.length ?? 0), 0),
    detailedSections: courses.reduce(
      (sum, course) => sum + (course.sections ?? []).filter((section) => section.details).length,
      0
    ),
  };
}

const outputPath = path.resolve(readArg("--output", defaultOutputPath));
const inputPaths = collectInputPaths(outputPath);

if (!inputPaths.length) {
  throw new Error("No Yedion catalog JSON files were found to merge.");
}

const coursesByCode = new Map();
const sourceFiles = [];
const sourceStartedAt = [];
const sourceFinishedAt = [];
let academicYearLabel = null;
let baseUrl = null;

for (const inputPath of inputPaths) {
  const catalog = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  sourceFiles.push(path.relative(rootDir, inputPath));

  if (catalog.source?.startedAt) {
    sourceStartedAt.push(catalog.source.startedAt);
  }
  if (catalog.source?.finishedAt) {
    sourceFinishedAt.push(catalog.source.finishedAt);
  }
  academicYearLabel ??= catalog.source?.academicYearLabel ?? null;
  baseUrl ??= catalog.source?.baseUrl ?? null;

  for (const course of catalog.courses ?? []) {
    const existing = coursesByCode.get(course.courseCode);
    coursesByCode.set(course.courseCode, existing ? mergeCourses(existing, course) : course);
  }
}

const courses = Array.from(coursesByCode.values()).sort((a, b) =>
  a.courseCode.localeCompare(b.courseCode, "he")
);
const stats = catalogStats(courses);
const mergedCatalog = {
  scraperVersion: 1,
  source: {
    baseUrl,
    startedAt: sourceStartedAt.sort()[0] ?? null,
    finishedAt: sourceFinishedAt.sort().at(-1) ?? new Date().toISOString(),
    academicYearLabel,
    sourceFiles,
  },
  options: {
    mergedFrom: sourceFiles,
  },
  stats,
  courses,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(mergedCatalog, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      outputPath,
      inputFiles: sourceFiles.length,
      ...stats,
    },
    null,
    2
  )
);
