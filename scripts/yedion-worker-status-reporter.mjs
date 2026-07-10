import fs from "node:fs";
import path from "node:path";

function readArgument(name, fallback) {
  const args = process.argv.slice(2);
  const prefix = `${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readEvents(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return "unknown";
  }
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  return hours ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

function createProgressLine(status, events) {
  const workEvents = events.filter((event) => event.stage === "snapshot");
  const courseSnapshots = workEvents.filter((event) => Number.isFinite(Number(event.savedAfterCourses)));
  const latestCourseSnapshot = courseSnapshots.at(-1);
  const coursePages = number(latestCourseSnapshot?.savedAfterCourses);
  const detailPages = workEvents.reduce(
    (maximum, event) => Math.max(maximum, number(event.detailedPagesVisited)),
    0
  );
  const requests = coursePages + detailPages;
  const firstWork = workEvents[0]?.at ? new Date(workEvents[0].at) : null;
  const lastWork = workEvents.at(-1)?.at ? new Date(workEvents.at(-1).at) : null;
  const elapsedMinutes = firstWork && lastWork ? (lastWork - firstWork) / 60000 : 0;
  const effectiveRpm = elapsedMinutes > 0 && requests > 1 ? (requests - 1) / elapsedMinutes : 0;
  const candidates = number(status.candidates);
  const remainingCoursePages = Math.max(0, candidates - coursePages);
  const detailsPerCourse = coursePages > 0 ? detailPages / coursePages : 0;
  const projectedRemainingRequests = remainingCoursePages * (1 + detailsPerCourse);
  const etaMinutes = effectiveRpm > 0 ? projectedRemainingRequests / effectiveRpm : null;

  return [
    new Date().toISOString(),
    `state=${status.state || "unknown"}`,
    `phase=${status.phase || "unknown"}`,
    `courses=${coursePages}/${candidates}`,
    `course_pages_remaining=${remainingCoursePages}`,
    `detail_pages=${detailPages}`,
    `requests=${requests}`,
    `rate=${effectiveRpm ? effectiveRpm.toFixed(1) : "unknown"}rpm`,
    `eta=${formatDuration(etaMinutes)}`,
    `errors=${number(status.errorCount)}`,
  ].join(" | ");
}

const workerDir = path.resolve(readArgument("--worker-dir", "data/yedion/worker"));
const intervalSeconds = number(readArgument("--interval-seconds", 60));
const outputPath = path.resolve(readArgument("--output", path.join(workerDir, "progress.txt")));
const once = hasFlag("--once");

if (intervalSeconds <= 0) {
  throw new Error("--interval-seconds must be greater than zero.");
}

function writeProgress() {
  const status = readJson(path.join(workerDir, "status.json"));
  if (!status) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.appendFileSync(outputPath, `${new Date().toISOString()} | state=missing-status\n`, "utf8");
    return true;
  }

  const events = readEvents(path.join(status.runDir, "events.ndjson"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.appendFileSync(outputPath, `${createProgressLine(status, events)}\n`, "utf8");
  return status.state !== "running";
}

const terminal = writeProgress();
if (once || terminal) {
  process.exit(0);
}

const timer = setInterval(() => {
  if (writeProgress()) {
    clearInterval(timer);
  }
}, intervalSeconds * 1000);
