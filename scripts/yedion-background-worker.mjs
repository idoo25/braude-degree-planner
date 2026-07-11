import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

import { scrapeYedionCatalog } from "./yedion-browser-scraper.mjs";

const ROOT_DIR = process.cwd();
const ENTRY_URL = "https://info.braude.ac.il/yedion/fireflyweb.aspx?prgname=Enter_Search";
const DEFAULT_EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function readArgument(name, fallback = null) {
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

function parsePositiveNumber(name, fallback, maximum = Number.POSITIVE_INFINITY) {
  const value = Number(readArgument(name, fallback));
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be a number between 0 and ${maximum}.`);
  }
  return value;
}

function isoFilePart(value = new Date().toISOString()) {
  return value.replace(/[:.]/g, "-");
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function sleepSynchronously(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.renameSync(temporaryPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== "EPERM") {
        break;
      }
      sleepSynchronously(50 * (attempt + 1));
    }
  }

  fs.rmSync(temporaryPath, { force: true });
  throw lastError;
}

function appendJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function normalizeSemester(value) {
  const text = String(value || "").trim();
  if (text === "\u05d0") return "1";
  if (text === "\u05d1") return "2";
  if (text === "\u05d2" || text === "\u05e7\u05d9\u05e5") return "3";
  return text;
}

function courseNeedsDetails(course) {
  const semesterGroups = new Map();

  for (const section of course.sections || []) {
    const key = [
      course.courseCode,
      section.academicYearLabel || course.academicYearLabel || "",
      normalizeSemester(section.semesterCode || section.semesterPeriod),
    ].join(":");
    const group = semesterGroups.get(key) || { hasDetails: false };
    group.hasDetails ||= Boolean(section.details);
    semesterGroups.set(key, group);
  }

  return Array.from(semesterGroups.values()).some((group) => !group.hasDetails);
}

function requiredCourseCodes(catalog) {
  return (catalog.courses || [])
    .filter((course) => !(course.sections || []).length || courseNeedsDetails(course))
    .map((course) => String(course.courseCode))
    .sort((left, right) => left.localeCompare(right, "he"));
}

function createPlaywrightBrowserAdapter(page) {
  const tab = {
    goto: (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }),
    playwright: {
      evaluate: async (pageFunction, argument) => page.evaluate(pageFunction, argument),
    },
  };

  return {
    tabs: {
      list: async () => [{ id: "worker" }],
      get: async () => tab,
      new: async () => tab,
    },
  };
}

async function waitForManualLogin(page, timeoutMs, writeStatus) {
  const openedAt = Date.now();
  let lastObservedUrl = "";

  await page.goto(ENTRY_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

  while (Date.now() - openedAt < timeoutMs) {
    const currentUrl = page.url();
    const title = await page.title().catch(() => "");
    if (currentUrl !== lastObservedUrl) {
      lastObservedUrl = currentUrl;
      writeStatus({ phase: "waiting-for-login", currentUrl, title });
    }

    if (currentUrl.includes("info.braude.ac.il/yedion/fireflyweb.aspx")) {
      await page.goto(ENTRY_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      if (page.url().includes("info.braude.ac.il/yedion/fireflyweb.aspx")) {
        return;
      }
    }

    await sleep(2000);
  }

  const error = new Error("Timed out waiting for manual Yedion login.");
  error.code = "YEDION_LOGIN_TIMEOUT";
  throw error;
}

async function saveFailureArtifacts(page, runDir) {
  const artifactsDir = path.join(runDir, "failure-artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  const prefix = isoFilePart();
  const saved = {};

  try {
    const screenshotPath = path.join(artifactsDir, `${prefix}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    saved.screenshotPath = screenshotPath;
  } catch {}

  try {
    const htmlPath = path.join(artifactsDir, `${prefix}.html`);
    fs.writeFileSync(htmlPath, await page.content(), "utf8");
    saved.htmlPath = htmlPath;
  } catch {}

  return saved;
}

function importCatalog(inputPath, runDir) {
  const result = spawnSync(
    process.execPath,
    ["scripts/import-yedion-catalog.mjs", `--input=${inputPath}`],
    { cwd: ROOT_DIR, encoding: "utf8" }
  );
  const logPath = path.join(runDir, "import.log");
  fs.writeFileSync(
    logPath,
    [result.stdout, result.stderr, result.error ? String(result.error) : ""].filter(Boolean).join("\n"),
    "utf8"
  );

  if (result.status !== 0 || result.error) {
    const error = new Error(`SQLite import failed. See ${logPath}`);
    error.code = "DATABASE_IMPORT_FAILED";
    throw error;
  }

  return logPath;
}

const requestsPerMinute = parsePositiveNumber("--rpm", 25, 60);
const requestDelayMs = Math.ceil(60000 / requestsPerMinute);
const loginTimeoutMinutes = parsePositiveNumber("--login-timeout-minutes", 15, 60);
const notBeforeText = readArgument("--not-before", null);
const notBefore = notBeforeText ? new Date(notBeforeText) : null;
const inputPath = path.resolve(readArgument("--input", "data/yedion/catalog-current.json"));
const outputPath = path.resolve(readArgument("--output", "data/yedion/catalog-current.json"));
const workerDir = path.resolve(readArgument("--worker-dir", "data/yedion/worker"));
const edgePath = path.resolve(readArgument("--edge-path", DEFAULT_EDGE_PATH));
const dryRun = hasFlag("--dry-run");
const resetState = hasFlag("--reset-state");
const statePath = path.join(workerDir, "state.json");
const activeRunPath = path.join(workerDir, "active-run.json");
const statusPath = path.join(workerDir, "status.json");

if (notBeforeText && Number.isNaN(notBefore.getTime())) {
  throw new Error("--not-before must be an ISO 8601 date and time.");
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input catalog was not found: ${inputPath}`);
}

if (!fs.existsSync(edgePath)) {
  throw new Error(`Microsoft Edge was not found: ${edgePath}`);
}

const activeRun = readJson(activeRunPath, null);
if (activeRun?.pid && activeRun.pid !== process.pid && isProcessRunning(activeRun.pid)) {
  throw new Error(`A Yedion worker is already running (PID ${activeRun.pid}).`);
}
if (activeRun) {
  fs.rmSync(activeRunPath, { force: true });
}

if (resetState) {
  fs.rmSync(statePath, { force: true });
}

const initialCatalog = readJson(inputPath, null);
const candidateCourseCodes = requiredCourseCodes(initialCatalog);
const persistedState = readJson(statePath, { completedCourseCodes: [] });
const completedCourseCodes = new Set(persistedState.completedCourseCodes || []);
const pendingCourseCodes = candidateCourseCodes.filter((code) => !completedCourseCodes.has(code));

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        requestsPerMinute,
        requestDelayMs,
        candidateCourseCodes: candidateCourseCodes.length,
        alreadyCompleted: candidateCourseCodes.length - pendingCourseCodes.length,
        pendingCourseCodes: pendingCourseCodes.length,
        inputPath,
        outputPath,
        workerDir,
      },
      null,
      2
    )
  );
  process.exit(0);
}

const runId = `run-${isoFilePart()}`;
const runDir = path.join(workerDir, runId);
const eventsPath = path.join(runDir, "events.ndjson");
const errorsPath = path.join(runDir, "errors.ndjson");
const pageCacheDir = path.join(runDir, "page-cache");
const profileDir = path.join(workerDir, "browser-profile");
const startedAt = new Date().toISOString();
let errorCount = 0;
let currentPhase = "starting";
let terminalState = "running";
let lastEvent = null;

function persistWorkerState() {
  writeJsonAtomic(statePath, {
    version: 1,
    inputPath,
    outputPath,
    requestsPerMinute,
    updatedAt: new Date().toISOString(),
    completedCourseCodes: Array.from(completedCourseCodes).sort((left, right) => left.localeCompare(right, "he")),
  });
}

function writeStatus(extra = {}) {
  const completedCurrentCandidates = candidateCourseCodes.filter((code) =>
    completedCourseCodes.has(code)
  ).length;

  writeJsonAtomic(statusPath, {
    runId,
    pid: process.pid,
    state: terminalState,
    phase: currentPhase,
    startedAt,
    updatedAt: new Date().toISOString(),
    requestsPerMinute,
    requestDelayMs,
    notBefore: notBefore?.toISOString() || null,
    candidates: candidateCourseCodes.length,
    pendingAtStart: pendingCourseCodes.length,
    completed: completedCurrentCandidates,
    remaining: Math.max(0, candidateCourseCodes.length - completedCurrentCandidates),
    errorCount,
    inputPath,
    outputPath,
    runDir,
    lastEvent,
    ...extra,
  });
}

function recordEvent(event) {
  const entry = { at: new Date().toISOString(), ...event };
  lastEvent = entry;
  currentPhase = event.stage || currentPhase;
  appendJsonLine(eventsPath, entry);

  if (event.stage === "course" && Number.isInteger(event.current)) {
    for (const code of pendingCourseCodes.slice(0, event.current)) {
      completedCourseCodes.add(code);
    }
    persistWorkerState();
  }

  writeStatus();
}

function recordError(kind, error, extra = {}) {
  errorCount += 1;
  const entry = {
    at: new Date().toISOString(),
    kind,
    code: error?.code || null,
    message: String(error?.message || error),
    stack: error?.stack || null,
    ...extra,
  };
  appendJsonLine(errorsPath, entry);
  lastEvent = { stage: "error", ...entry };
  writeStatus();
  return entry;
}

fs.mkdirSync(runDir, { recursive: true });
writeJsonAtomic(path.join(runDir, "run.json"), {
  runId,
  startedAt,
  inputPath,
  outputPath,
  candidateCourseCodes,
  pendingCourseCodes,
  requestsPerMinute,
  requestDelayMs,
  notBefore: notBefore?.toISOString() || null,
});
writeJsonAtomic(activeRunPath, { runId, pid: process.pid, startedAt, statusPath });
writeStatus();

let context = null;
let page = null;
let exitCode = 0;

async function waitForAllowedStart() {
  if (!notBefore) {
    return;
  }

  while (Date.now() < notBefore.getTime()) {
    currentPhase = "waiting-for-rate-window";
    writeStatus({ notBefore: notBefore.toISOString() });
    await sleep(Math.min(60000, notBefore.getTime() - Date.now()));
  }
}

try {
  await waitForAllowedStart();

  if (!pendingCourseCodes.length) {
    terminalState = "complete";
    currentPhase = "nothing-pending";
    recordEvent({ stage: "nothing-pending" });
  } else {
    currentPhase = "launching-browser";
    writeStatus();
    context = await chromium.launchPersistentContext(profileDir, {
      executablePath: edgePath,
      headless: false,
      viewport: { width: 1440, height: 1000 },
    });
    page = context.pages()[0] || (await context.newPage());

    currentPhase = "waiting-for-login";
    writeStatus();
    await waitForManualLogin(page, loginTimeoutMinutes * 60000, writeStatus);
    recordEvent({ stage: "login-confirmed", currentUrl: page.url() });

    currentPhase = "collecting";
    writeStatus();
    const catalog = await scrapeYedionCatalog({
      browser: createPlaywrightBrowserAdapter(page),
      inputPath,
      outputPath,
      courseCodes: pendingCourseCodes,
      detailMode: "course-semester",
      retryDetailErrors: true,
      refreshSections: false,
      requestDelayMs,
      requestJitterMs: 0,
      rateLimitRetries: 0,
      saveEveryCourses: 1,
      saveEveryDetails: 1,
      cachePages: true,
      pageCacheDir,
      onProgress: recordEvent,
    });

    terminalState = "complete";
    currentPhase = "importing-database";
    recordEvent({ stage: "catalog-complete", stats: catalog.stats });
  }
} catch (error) {
  const isRateLimit = error?.code === "YEDION_RATE_LIMIT";
  terminalState = isRateLimit ? "stopped-rate-limit" : "failed";
  currentPhase = terminalState;
  const artifacts = page ? await saveFailureArtifacts(page, runDir) : {};
  recordError(isRateLimit ? "rate-limit" : "fatal", error, { ...artifacts, currentUrl: page?.url() || null });
  exitCode = isRateLimit ? 2 : 1;
} finally {
  try {
    currentPhase = "importing-database";
    writeStatus();
    const importLogPath = importCatalog(outputPath, runDir);
    recordEvent({ stage: "database-imported", importLogPath });
  } catch (error) {
    terminalState = "failed";
    currentPhase = "database-import-failed";
    recordError("database-import", error);
    exitCode = 1;
  }

  if (context) {
    await context.close().catch((error) => recordError("browser-close", error));
  }

  fs.rmSync(activeRunPath, { force: true });
  writeStatus({ finishedAt: new Date().toISOString() });
}

process.exitCode = exitCode;
