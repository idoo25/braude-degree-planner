import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const BASE_URL = "https://info.braude.ac.il/yedion/fireflyweb.aspx";
const DEFAULT_REQUEST_DELAY_MS = 25000;
const DEFAULT_REQUEST_JITTER_MS = 5000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45000;
const DEFAULT_HEBREW_LETTERS = [
  "א",
  "ב",
  "ג",
  "ד",
  "ה",
  "ו",
  "ז",
  "ח",
  "ט",
  "י",
  "כ",
  "ל",
  "מ",
  "נ",
  "ס",
  "ע",
  "פ",
  "צ",
  "ק",
  "ר",
  "ש",
  "ת",
];

function buildUrl(prgname, args) {
  const url = new URL(BASE_URL);
  url.searchParams.set("prgname", prgname);
  if (args) {
    url.searchParams.set("arguments", args);
  }
  return url.toString();
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

function logProgress(onProgress, event) {
  if (typeof onProgress === "function") {
    onProgress({ at: new Date().toISOString(), ...event });
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomDelay(maxMs) {
  if (!maxMs || maxMs <= 0) {
    return 0;
  }
  return Math.floor(Math.random() * maxMs);
}

export function isYedionRateLimitedText(value) {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("rate limit") ||
    text.includes("too many requests") ||
    text.includes("\u05d9\u05d5\u05ea\u05e8 \u05de\u05d3\u05d9 \u05e9\u05d0\u05d9\u05dc\u05ea\u05d5\u05ea") ||
    text.includes("\u05d4\u05e9\u05d4\u05d9\u05d9\u05ea \u05d2\u05d9\u05e9\u05d4") ||
    text.includes("\u05e0\u05d9\u05ea\u05df \u05dc\u05e0\u05e1\u05d5\u05ea \u05e9\u05d5\u05d1")
  );
}

function yedionRateLimitError(pageState) {
  const error = new Error("Yedion rate-limited this run. The worker stopped without retrying.");
  error.code = "YEDION_RATE_LIMIT";
  error.pageState = pageState;
  return error;
}

function normalizeSemesterValue(value) {
  const text = String(value || "").trim();
  const semesterLabels = new Map([
    ["\u05d0", "1"],
    ["\u05d1", "2"],
    ["\u05d2", "3"],
    ["\u05e7\u05d9\u05e5", "3"],
  ]);
  return semesterLabels.get(text) || text;
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function detailEquivalenceKey(course, section) {
  const detail = section.details ?? {};
  const academicYearLabel =
    section.academicYearLabel ?? detail.academicYearLabel ?? course.academicYearLabel ?? "";
  const semester = normalizeSemesterValue(
    section.semesterCode ??
    detail.semesterCode ??
    section.semesterPeriod ??
    detail.semesterPeriod ??
    ""
  );
  return [course.courseCode, academicYearLabel, semester].join(":");
}

function isCourseSemesterDetailMode(detailMode) {
  return ["course-semester", "courseSemester", "semester"].includes(detailMode);
}

function safeFilePart(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function pageCacheFileName(url, index) {
  const parsedUrl = new URL(url);
  const prgname = parsedUrl.searchParams.get("prgname") || "page";
  const args = parsedUrl.searchParams.get("arguments") || "";
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
  return [
    String(index).padStart(5, "0"),
    safeFilePart(prgname),
    safeFilePart(args),
    hash,
  ]
    .filter(Boolean)
    .join("__") + ".json";
}

async function readCurrentPageSnapshot(tab) {
  return tab.playwright.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const text = clean(document.body?.innerText || document.body?.textContent || "");
    return {
      href: location.href,
      title: document.title || "",
      text,
      html: document.documentElement?.outerHTML || "",
      isRateLimited: /השהיית גישה זמנית|יותר מידי שאילתות|ניתן לנסות שוב/.test(text),
    };
  });
}

function courseCodeFromYedionUrl(url) {
  return (String(url).match(/[?&]arguments=-?N?(\d+)/i) || [])[1] || null;
}

function letterFromYedionUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const args = parsedUrl.searchParams.get("arguments") || "";
    return args.replace(/^-N/i, "") || null;
  } catch {
    return null;
  }
}

async function getTab(browser) {
  const tabs = await browser.tabs.list();
  if (!tabs.length) {
    return browser.tabs.new();
  }

  return browser.tabs.get(tabs[0].id);
}

function isExpectedYedionPage(currentUrl, requestedUrl) {
  try {
    const current = new URL(currentUrl);
    const requested = new URL(requestedUrl);
    return (
      current.pathname === requested.pathname &&
      current.searchParams.get("prgname") === requested.searchParams.get("prgname") &&
      (current.searchParams.get("arguments") || "") ===
        (requested.searchParams.get("arguments") || "")
    );
  } catch {
    return false;
  }
}

async function readYedionPageState(tab) {
  return tab.playwright.evaluate(() => {
    const text = (document.body?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1200);
    return { href: location.href, title: document.title, text };
  });
}

async function gotoYedion(tab, url, { maxRateLimitRetries = 5, rateLimitPauseMs = 65000 } = {}) {
  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt += 1) {
    let pageState = await readYedionPageState(tab);
    if (!isExpectedYedionPage(pageState.href, url)) {
      let navigationError = null;
      tab.goto(url).catch((error) => {
        navigationError = error;
      });

      const startedAtMs = Date.now();
      while (Date.now() - startedAtMs < DEFAULT_NAVIGATION_TIMEOUT_MS) {
        await sleep(1000);
        if (navigationError) {
          throw navigationError;
        }

        pageState = await readYedionPageState(tab);
        if (isExpectedYedionPage(pageState.href, url) && pageState.text) {
          break;
        }
      }

      if (!isExpectedYedionPage(pageState.href, url)) {
        throw new Error(
          `Timed out navigating to Yedion page after ${DEFAULT_NAVIGATION_TIMEOUT_MS}ms: ${url}`
        );
      }
    }

    if (!pageState.href.includes("/yedion/fireflyweb.aspx")) {
      throw new Error(
        `The Yedion browser session is not on the expected site. Current URL: ${pageState.href}`
      );
    }

    if (isYedionRateLimitedText(pageState.text)) {
      if (attempt === maxRateLimitRetries) {
        throw yedionRateLimitError(pageState);
      }
      await sleep(rateLimitPauseMs);
      continue;
    }

    if (/Citrix|OTP|password|סיסמה|התחברות/i.test(pageState.title + " " + pageState.text)) {
      throw new Error("The Yedion session appears to require login again.");
    }

    return pageState;
  }
}

async function parseCourseListPage(tab, firstLetter) {
  return tab.playwright.evaluate((letter) => {
    function clean(value) {
      return (value || "").replace(/\s+/g, " ").trim();
    }

    function cellValue(text) {
      return clean(text).replace(/^[^:]+:\s*/, "").trim();
    }

    return Array.from(document.querySelectorAll(".row.Tr, tr"))
      .map((row) => {
        const cells = Array.from(row.children).map((cell) => clean(cell.innerText || cell.textContent));
        const button = row.querySelector('[data-progname="S_LOOK_FOR_NOSE"]');
        const rawArguments = button?.getAttribute("data-arguments") || "";
        const courseCode = (rawArguments.match(/-N(\d+)/) || cells[0]?.match(/(\d+)/) || [])[1];

        if (!courseCode) {
          return null;
        }

        return {
          courseCode,
          name: cellValue(cells[1] || ""),
          taughtStatus: cellValue(cells[2] || ""),
          firstLetter: letter,
          rawArguments,
          detailListUrl: `${location.origin}${location.pathname}?prgname=S_LOOK_FOR_NOSE&arguments=${rawArguments}`,
          rawCells: cells,
        };
      })
      .filter(Boolean);
  }, firstLetter);
}

async function parseCourseSectionsPage(tab, courseCode) {
  return tab.playwright.evaluate(
    ({ expectedCourseCode, baseUrl }) => {
      function clean(value) {
        return (value || "").replace(/\s+/g, " ").trim();
      }

      function valueAfter(text, labels) {
        let result = clean(text);
        for (const label of labels) {
          const re = new RegExp(`^${label}\\s*:?\\s*`);
          result = result.replace(re, "");
        }
        return clean(result);
      }

      function parseArgs(rawArguments) {
        const values = (rawArguments || "").split(",").map((value) => value.replace(/^-N/i, "").trim());
        return {
          courseCode: values[0] || expectedCourseCode,
          semesterCode: values[1] || null,
          sectionTypeCode: values[2] || null,
          groupCode: values[3] || null,
          groupNumber: values[4] || null,
        };
      }

      function parseMeetingTable(table) {
        if (!table) {
          return [];
        }

        return Array.from(table.querySelectorAll(".row.Tr, tr"))
          .map((row) => {
            const cells = Array.from(row.children).map((cell) => clean(cell.innerText || cell.textContent));
            if (cells.length < 5) {
              return null;
            }

            return {
              semesterPeriod: valueAfter(cells[0], ["סמסטר"]),
              dayOfWeek: valueAfter(cells[1], ["יום בשבוע"]),
              startTime: valueAfter(cells[2], ["שעת התחלה"]),
              endTime: valueAfter(cells[3], ["שעת סיום"]),
              lecturerName: valueAfter(cells[4], ["מרצה"]),
              room: valueAfter(cells[5] || "", ["חדר לימוד", "כיתה"]),
              rawCells: cells,
            };
          })
          .filter(Boolean);
      }

      function linkedGroupsFromText(text) {
        const matches = clean(text).matchAll(/(\d+)\s*\/\s*(\d+)/g);
        return Array.from(matches).map((match) => ({
          groupCode: match[1],
          groupNumber: match[2],
        }));
      }

      const titleText = clean(
        document.querySelector(".fcontainer > .row:first-child .col")?.innerText ||
          document.querySelector("article form")?.innerText ||
          ""
      );
      const courseName =
        (titleText.match(/קורס\s+(.+?)\s+שנה"?ל/) || titleText.match(/^(.+?)\s+שנה"?ל/))?.[1] ||
        null;
      const academicYearLabel = (titleText.match(/שנה"?ל\s*([^\s]+)/) || [])[1] || null;
      const syllabusDetails = document.querySelector(`details[id*="${expectedCourseCode}"]`);
      const syllabusText = clean(syllabusDetails?.textContent || "").replace(/^פרשיית לימוד\s*/, "");

      const col = Array.from(document.querySelectorAll(".fcontainer > .row > .col")).find((element) =>
        clean(element.textContent).includes("קורס מסוג")
      );
      const sections = [];

      if (col) {
        const children = Array.from(col.children);
        for (let index = 0; index < children.length; index += 1) {
          const header = children[index];
          const headerText = clean(header.innerText || header.textContent);
          if (!headerText.startsWith("קורס מסוג")) {
            continue;
          }

          const button = header.querySelector('[data-progname="S_CourseDetails"]');
          const rawArguments = button?.getAttribute("data-arguments") || null;
          const parsedArgs = parseArgs(rawArguments);
          const betweenHeaderAndSchedule = [];
          let table = null;
          for (const candidate of children.slice(index + 1, index + 8)) {
            if (candidate.classList?.contains("MasterTable")) {
              table = candidate;
              break;
            }

            const text = clean(candidate.innerText || candidate.textContent);
            if (text) {
              betweenHeaderAndSchedule.push(text);
            }
          }
          const linkedGroupsText =
            betweenHeaderAndSchedule.find((text) => text.includes("קבוצות הקשורות")) || "";
          const noteText = betweenHeaderAndSchedule
            .filter((text) => !text.includes("קבוצות הקשורות"))
            .join(" ");
          const sectionType = (headerText.match(/קורס מסוג\s+(.+?)\s+קבוצה/) || [])[1] || null;
          const groupMatch = headerText.match(/קבוצה\s*:\s*(\d+)(?:\s*\/\s*(\d+))?/);
          const lecturerName =
            (headerText.match(/מרצה הקורס\s*:\s*(.+?)(?:\s+פרטים נוספים|\s+הקורס מלא|\s+הקורס חסום לרישום|\s+שפת הוראה|$)/) || [])[1] ||
            null;
          const teachingLanguage =
            (headerText.match(/שפת הוראה של הקורס\s*:\s*(.+?)$/) || [])[1]?.replace(/^הקורס (?:מלא|חסום לרישום)\s*/, "") ||
            null;
          const meetings = parseMeetingTable(table);

          sections.push({
            sectionKey: [
              expectedCourseCode,
              parsedArgs.semesterCode || "",
              parsedArgs.sectionTypeCode || "",
              parsedArgs.groupCode || groupMatch?.[1] || "",
              parsedArgs.groupNumber || groupMatch?.[2] || "",
            ].join(":"),
            courseCode: expectedCourseCode,
            academicYearLabel,
            semesterCode: parsedArgs.semesterCode,
            semesterPeriod: meetings.find((meeting) => meeting.semesterPeriod)?.semesterPeriod || null,
            sectionTypeCode: parsedArgs.sectionTypeCode,
            sectionType,
            groupCode: parsedArgs.groupCode || groupMatch?.[1] || null,
            groupNumber: parsedArgs.groupNumber || groupMatch?.[2] || null,
            lecturerName: clean(lecturerName),
            isFull: headerText.includes("הקורס מלא"),
            isBlockedForRegistration: headerText.includes("הקורס חסום לרישום"),
            teachingLanguage: clean(teachingLanguage),
            noteText,
            linkedGroups: linkedGroupsFromText(linkedGroupsText),
            rawArguments,
            detailUrl: rawArguments
              ? `${baseUrl}?prgname=S_CourseDetails&arguments=${rawArguments}`
              : null,
            meetings,
            rawHeaderText: headerText,
            rawBetweenHeaderAndSchedule: betweenHeaderAndSchedule,
          });
        }
      }

      return {
        courseCode: expectedCourseCode,
        name: clean(courseName),
        academicYearLabel,
        syllabusText,
        sections,
        sourceUrl: location.href,
      };
    },
    { expectedCourseCode: courseCode, baseUrl: BASE_URL }
  );
}

async function parseCourseDetailPage(tab, rawArguments) {
  return tab.playwright.evaluate(
    ({ args, baseUrl }) => {
      function clean(value) {
        return (value || "").replace(/\s+/g, " ").trim();
      }

      function valueAfter(text, labels) {
        let result = clean(text);
        for (const label of labels) {
          const re = new RegExp(`^${label}\\s*:?\\s*`);
          result = result.replace(re, "");
        }
        return clean(result);
      }

      function parseArgs(raw) {
        const values = (raw || "").split(",").map((value) => value.replace(/^-N/i, "").trim());
        return {
          courseCode: values[0] || null,
          semesterCode: values[1] || null,
          sectionTypeCode: values[2] || null,
          groupCode: values[3] || null,
          groupNumber: values[4] || null,
        };
      }

      function parseNumber(value) {
        const match = clean(value).match(/\d+(?:[.]\d+)?/);
        return match ? Number(match[0]) : null;
      }

      function parseDate(value) {
        const match = clean(value).match(/(\d{2})\/(\d{2})\/(\d{4})/);
        return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
      }

      function parseMeetingTable(table) {
        if (!table) {
          return [];
        }

        return Array.from(table.querySelectorAll(".row.Tr, tr"))
          .map((row) => {
            const cells = Array.from(row.children).map((cell) => clean(cell.innerText || cell.textContent));
            if (cells.length < 5) {
              return null;
            }

            return {
              semesterPeriod: valueAfter(cells[0], ["סמסטר"]),
              dayOfWeek: valueAfter(cells[1], ["יום בשבוע"]),
              startTime: valueAfter(cells[2], ["שעת התחלה"]),
              endTime: valueAfter(cells[3], ["שעת סיום"]),
              lecturerName: valueAfter(cells[4], ["מרצה"]),
              room: valueAfter(cells[5] || "", ["חדר לימוד", "כיתה"]),
              rawCells: cells,
            };
          })
          .filter(Boolean);
      }

      function parseExams(rawText) {
        const text = clean(rawText);
        const examType = (text.match(/סוג\s*:\s*(.+)$/) || [])[1] || null;
        const exams = [];
        const regex = /מועד\s*([0-9א-ת]+)\s*:\s*([^0-9]*?)\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2})/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
          exams.push({
            termLabel: `מועד ${match[1]}`,
            examKind: clean(match[2]),
            examType: examType ? clean(examType) : null,
            examDate: parseDate(match[3]),
            examTime: match[4],
            rawText: text,
          });
        }
        return exams;
      }

      function rowValue(rows, label) {
        const row = rows.find((value) => clean(value).startsWith(label));
        return row ? valueAfter(row, [label]) : null;
      }

      function parseDetailArguments(href) {
        const match = (href || "").match(/[?&]arguments=([^&#]+)/);
        return match ? match[1] : null;
      }

      const parsedArgs = parseArgs(args);
      const container = document.querySelector(".fcontainer");
      const rows = Array.from(container?.children || [])
        .map((row) => clean(row.innerText || row.textContent))
        .filter(Boolean);
      const firstRow = rows.find((row) => /^\d+/.test(row)) || "";
      const firstRowMatch = firstRow.match(/^(\d+)\s+(.+)$/);
      const examRaw = rows.find((row) => row.startsWith("תאריך בחינה")) || "";
      const syllabusUrl =
        Array.from(document.querySelectorAll("a[href]"))
          .map((link) => link.href)
          .find((href) => /\.(pdf|docx?|rtf)(?:$|[?#])/i.test(href)) || null;
      const syllabusDetails = document.querySelector("details");
      const syllabusText = clean(syllabusDetails?.textContent || "").replace(/^פרשיית לימוד\s*/, "");
      const scheduleTable = Array.from(document.querySelectorAll(".MasterTable")).find((table) =>
        clean(table.innerText || table.textContent).startsWith("מערכת שעות")
      );
      const relationTables = Array.from(document.querySelectorAll(".MasterTable")).filter((table) =>
        clean(table.innerText || table.textContent).startsWith("תנאי קדם")
      );
      const linkedTables = Array.from(document.querySelectorAll(".MasterTable")).filter((table) =>
        clean(table.innerText || table.textContent).startsWith("תנאי קשר")
      );

      const linkedSections = linkedTables.flatMap((table) => {
        const linkKind = clean(table.querySelector(".card-header-H2")?.innerText || table.innerText).split("סינון")[0];
        return Array.from(table.querySelectorAll(".row.Tr, tr"))
          .map((row) => {
            const cells = Array.from(row.children).map((cell) => clean(cell.innerText || cell.textContent));
            if (!cells.some((cell) => cell.includes("קוד קורס"))) {
              return null;
            }

            const link = row.querySelector('a[href*="S_CourseDetails"]');
            return {
              linkKind,
              linkedCourseCode: valueAfter(cells[0] || "", ["קוד קורס"]),
              linkedCourseName: valueAfter(cells[1] || "", ["שם קורס"]),
              linkedSectionType: valueAfter(cells[2] || "", ["סוג מקצוע"]),
              dayTimeText: valueAfter(cells[3] || "", ["יום ושעות"]),
              lecturerName: valueAfter(cells[4] || "", ["מרצה"]),
              detailArguments: parseDetailArguments(link?.href),
              detailUrl: link?.href || null,
              rawCells: cells,
            };
          })
          .filter(Boolean);
      });

      const relations = relationTables.flatMap((table) => {
        const relationTitle = clean(table.querySelector(".card-header-H2")?.innerText || "תנאי קדם לנושא");
        return Array.from(table.querySelectorAll(".row.Tr, tr"))
          .map((row) => {
            const cells = Array.from(row.children).map((cell) => clean(cell.innerText || cell.textContent));
            if (!cells.some((cell) => cell.includes(":") && !cell.endsWith(":"))) {
              return null;
            }
            return {
              relationTitle,
              relationType: valueAfter(cells[0] || "", ["סוג הקשר"]),
              population: valueAfter(cells[1] || "", ["אוכלוסייה לגביה תקף"]),
              relatedCourseCode: valueAfter(cells[2] || "", ["נושא נקשר"]),
              alternativeGroup: valueAfter(cells[3] || "", ["חליפי"]),
              rawCells: cells,
            };
          })
          .filter(Boolean);
      });

      return {
        rawArguments: args,
        detailUrl: `${baseUrl}?prgname=S_CourseDetails&arguments=${args}`,
        courseCode: parsedArgs.courseCode || firstRowMatch?.[1] || null,
        courseName: clean(firstRowMatch?.[2]),
        academicYearLabel: rowValue(rows, 'שנה"ל'),
        semesterCode: parsedArgs.semesterCode,
        sectionTypeCode: parsedArgs.sectionTypeCode,
        sectionType: rowValue(rows, "סוג קורס"),
        credits: parseNumber(rowValue(rows, "נקודות זכות")),
        semesterHours: parseNumber(rowValue(rows, "שעות סמסטריאליות")),
        lecturerName: rowValue(rows, "מרצה הקורס"),
        groupCode: parsedArgs.groupCode,
        groupNumber: parsedArgs.groupNumber,
        groupLabel: rowValue(rows, "קבוצה"),
        exams: parseExams(examRaw),
        syllabusUrl,
        syllabusText,
        isFull: rows.some((row) => row === "הקורס מלא"),
        isBlockedForRegistration: rows.some((row) => row === "הקורס חסום לרישום"),
        teachingLanguage: rowValue(rows, "שפת הוראה של הקורס"),
        meetings: parseMeetingTable(scheduleTable),
        linkedSections,
        relations,
        rawRows: rows,
      };
    },
    { args: rawArguments, baseUrl: BASE_URL },
    { timeoutMs: 10000 }
  );
}

export async function scrapeYedionCatalog({
  browser,
  outputPath,
  inputPath = null,
  letters = DEFAULT_HEBREW_LETTERS,
  courseCodes = null,
  maxCourses = null,
  detailMode = "all",
  listOnly = false,
  refreshSections = false,
  startAfterCourseCode = null,
  maxDetailPages = null,
  saveEveryCourses = 5,
  saveEveryDetails = 10,
  requestDelayMs = DEFAULT_REQUEST_DELAY_MS,
  requestJitterMs = DEFAULT_REQUEST_JITTER_MS,
  rateLimitRetries = 0,
  rateLimitPauseMs = 65000,
  maxRuntimeMs = null,
  cachePages = true,
  pageCacheDir = null,
  onProgress = null,
} = {}) {
  if (!browser) {
    throw new Error("A connected in-app browser is required.");
  }
  if (!outputPath) {
    throw new Error("outputPath is required.");
  }

  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const tab = await getTab(browser);
  const coursesByCode = new Map();
  let lastRequestAt = 0;
  let detailedPagesVisited = 0;
  let stoppedReason = null;
  let pageCacheIndex = 0;
  const resolvedPageCacheDir =
    cachePages && outputPath
      ? pageCacheDir ?? path.join(path.dirname(outputPath), "page-cache")
      : null;

  function buildCatalog(courses) {
    return {
      scraperVersion: 1,
      source: {
        baseUrl: BASE_URL,
        startedAt,
        finishedAt: new Date().toISOString(),
        academicYearLabel: courses.find((course) => course.academicYearLabel)?.academicYearLabel ?? null,
      },
      options: {
        inputPath,
        letters,
        courseCodes,
        maxCourses,
        detailMode,
        listOnly,
        refreshSections,
        startAfterCourseCode,
        maxDetailPages,
        saveEveryCourses,
        requestDelayMs,
        requestJitterMs,
        rateLimitRetries,
        rateLimitPauseMs,
        maxRuntimeMs,
        cachePages,
        pageCacheDir: resolvedPageCacheDir,
        stoppedReason,
      },
      stats: catalogStats(courses),
      courses,
    };
  }

  async function cacheCurrentPage(url, pageState) {
    if (!resolvedPageCacheDir) {
      return;
    }

    const snapshot = await tab.playwright.evaluate(() => {
      const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
      return {
        href: location.href,
        title: document.title,
        text: clean(document.body?.innerText || document.body?.textContent || ""),
        html: document.documentElement?.outerHTML || "",
      };
    });
    pageCacheIndex += 1;
    await fs.mkdir(resolvedPageCacheDir, { recursive: true });
    await fs.writeFile(
      path.join(resolvedPageCacheDir, pageCacheFileName(url, pageCacheIndex)),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          requestedUrl: url,
          pageState,
          ...snapshot,
        },
        null,
        2
      ),
      "utf8"
    );
  }

  async function saveSnapshot(courses) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(buildCatalog(courses), null, 2), "utf8");
  }

  async function navigate(url) {
    const elapsed = Date.now() - lastRequestAt;
    const requestedDelayMs = requestDelayMs + randomDelay(requestJitterMs);
    if (lastRequestAt && requestedDelayMs > elapsed) {
      await sleep(requestedDelayMs - elapsed);
    }
    const pageState = await gotoYedion(tab, url, {
      maxRateLimitRetries: rateLimitRetries,
      rateLimitPauseMs,
    });
    lastRequestAt = Date.now();
    await cacheCurrentPage(url, pageState);
    return pageState;
  }

  if (inputPath) {
    const existingCatalog = JSON.parse(await fs.readFile(inputPath, "utf8"));
    for (const course of existingCatalog.courses ?? []) {
      coursesByCode.set(String(course.courseCode), course);
    }
  }

  if (Array.isArray(courseCodes) && courseCodes.length) {
    for (const code of courseCodes) {
      const key = String(code);
      coursesByCode.set(key, {
        courseCode: key,
        name: key,
        taughtStatus: null,
        firstLetter: null,
        ...coursesByCode.get(key),
      });
    }
  } else if (!inputPath) {
    for (const letter of letters) {
      const url = buildUrl("S_LOOK_FOR_NOSE_AB", `-N${letter}`);
      await navigate(url);
      const courses = await parseCourseListPage(tab, letter);
      for (const course of courses) {
        coursesByCode.set(course.courseCode, {
          ...coursesByCode.get(course.courseCode),
          ...course,
        });
      }
      logProgress(onProgress, {
        stage: "letter",
        letter,
        coursesInLetter: courses.length,
        totalCourses: coursesByCode.size,
      });
    }
  }

  let selectedCourses = Array.from(coursesByCode.values()).sort((a, b) =>
    a.courseCode.localeCompare(b.courseCode, "he")
  );
  const requestedCourseCodes =
    Array.isArray(courseCodes) && courseCodes.length
      ? new Set(courseCodes.map((code) => String(code)))
      : null;
  if (requestedCourseCodes) {
    selectedCourses = selectedCourses.filter((course) =>
      requestedCourseCodes.has(String(course.courseCode))
    );
  }
  if (startAfterCourseCode) {
    selectedCourses = selectedCourses.filter((course) => course.courseCode > String(startAfterCourseCode));
  }
  selectedCourses = selectedCourses.slice(0, maxCourses ?? undefined);
  const seenDetailUrls = new Set();
  const shouldPreserveInputCatalog = Boolean(inputPath);

  function outputCourses() {
    return shouldPreserveInputCatalog
      ? Array.from(coursesByCode.values()).sort((a, b) => a.courseCode.localeCompare(b.courseCode, "he"))
      : selectedCourses;
  }

  if (listOnly) {
    const catalog = buildCatalog(outputCourses());
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(catalog, null, 2), "utf8");
    logProgress(onProgress, { stage: "done", outputPath, ...catalog.stats });
    return catalog;
  }

  function hasExceededRuntime() {
    if (maxRuntimeMs === null || maxRuntimeMs === undefined) {
      return false;
    }
    if (Date.now() - startedAtMs < maxRuntimeMs) {
      return false;
    }
    stoppedReason = stoppedReason ?? `maxRuntimeMs:${maxRuntimeMs}`;
    return true;
  }

  for (const [index, course] of selectedCourses.entries()) {
    if (hasExceededRuntime()) {
      break;
    }

    if (refreshSections || !course.sections?.length) {
      await navigate(buildUrl("S_LOOK_FOR_NOSE", `-N${course.courseCode}`));
      const parsedCourse = await parseCourseSectionsPage(tab, course.courseCode);

      Object.assign(course, {
        name: parsedCourse.name || course.name,
        academicYearLabel: parsedCourse.academicYearLabel || course.academicYearLabel || null,
        syllabusText: parsedCourse.syllabusText || course.syllabusText || null,
        sourceUrl: parsedCourse.sourceUrl,
        sections: parsedCourse.sections,
      });

      if (saveEveryCourses > 0 && (index + 1) % saveEveryCourses === 0) {
        const currentOutputCourses = outputCourses();
        await saveSnapshot(currentOutputCourses);
        logProgress(onProgress, {
          stage: "snapshot",
          outputPath,
          savedAfterCourses: index + 1,
          detailedPagesVisited,
          ...catalogStats(currentOutputCourses),
        });
      }
    }

    if (detailMode !== "none") {
      const availableSections = course.sections ?? [];
      const courseSemesterMode = isCourseSemesterDetailMode(detailMode);
      const detailedEquivalentKeys = new Set(
        availableSections
          .filter((section) => section.details || section.detailError)
          .map((section) => detailEquivalenceKey(course, section))
      );
      const sectionsToDetail = detailMode === "first" ? availableSections.slice(0, 1) : availableSections;
      for (const section of sectionsToDetail) {
        if (hasExceededRuntime()) {
          break;
        }

        const equivalentKey = detailEquivalenceKey(course, section);
        if (
          section.details ||
          section.detailError ||
          !section.detailUrl ||
          !section.rawArguments ||
          seenDetailUrls.has(section.detailUrl)
        ) {
          continue;
        }
        if (courseSemesterMode && detailedEquivalentKeys.has(equivalentKey)) {
          continue;
        }

        if (maxDetailPages !== null && detailedPagesVisited >= maxDetailPages) {
          stoppedReason = `maxDetailPages:${maxDetailPages}`;
          break;
        }

        try {
          await navigate(section.detailUrl);
          section.details = await parseCourseDetailPage(tab, section.rawArguments);
        } catch (error) {
          if (error?.code === "YEDION_RATE_LIMIT") {
            stoppedReason = "rate-limited";
            await saveSnapshot(outputCourses());
            logProgress(onProgress, {
              stage: "rate-limited",
              outputPath,
              courseCode: course.courseCode,
              sectionKey: section.sectionKey,
            });
            throw error;
          }
          section.detailError = {
            at: new Date().toISOString(),
            message: String(error?.message || error),
            detailUrl: section.detailUrl,
            rawArguments: section.rawArguments,
          };
          seenDetailUrls.add(section.detailUrl);
          detailedEquivalentKeys.add(equivalentKey);
          await saveSnapshot(outputCourses());
          logProgress(onProgress, {
            stage: "detail-error",
            outputPath,
            courseCode: course.courseCode,
            sectionKey: section.sectionKey,
            message: section.detailError.message,
          });
          continue;
        }
        seenDetailUrls.add(section.detailUrl);
        detailedEquivalentKeys.add(equivalentKey);
        detailedPagesVisited += 1;

        if (section.details.syllabusUrl && !course.syllabusUrl) {
          course.syllabusUrl = section.details.syllabusUrl;
        }
        if (section.details.syllabusText && !course.syllabusText) {
          course.syllabusText = section.details.syllabusText;
        }
        if (section.details.credits !== null && section.details.credits !== undefined && course.credits === undefined) {
          course.credits = section.details.credits;
        }
        if (
          section.details.semesterHours !== null &&
          section.details.semesterHours !== undefined &&
          course.semesterHours === undefined
        ) {
          course.semesterHours = section.details.semesterHours;
        }

        if (saveEveryDetails > 0 && detailedPagesVisited % saveEveryDetails === 0) {
          const currentOutputCourses = outputCourses();
          await saveSnapshot(currentOutputCourses);
          logProgress(onProgress, {
            stage: "snapshot",
            outputPath,
            detailedPagesVisited,
            ...catalogStats(currentOutputCourses),
          });
        }
      }
    }

    if (stoppedReason) {
      break;
    }

    if ((index + 1) % 5 === 0 || index === selectedCourses.length - 1) {
      logProgress(onProgress, {
        stage: "course",
        current: index + 1,
        total: selectedCourses.length,
        courseCode: course.courseCode,
        sections: course.sections?.length ?? 0,
        detailedPagesVisited,
      });
    }
  }

  const catalog = buildCatalog(outputCourses());

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(catalog, null, 2), "utf8");
  logProgress(onProgress, { stage: "done", outputPath, ...catalog.stats });

  return catalog;
}

export async function captureCurrentYedionPage({
  browser,
  pageCacheDir = "C:/school/braude-degree-planner/data/yedion/page-cache/backfill",
  catalogDir = "C:/school/braude-degree-planner/data/yedion/backfill",
} = {}) {
  if (!browser) {
    throw new Error("A connected in-app browser is required.");
  }

  const tab = await getTab(browser);
  const snapshot = await readCurrentPageSnapshot(tab);
  const index = Date.now();
  const rawFileName = pageCacheFileName(snapshot.href, index);
  const rawFilePath = path.join(pageCacheDir, rawFileName);

  await fs.mkdir(pageCacheDir, { recursive: true });
  await fs.writeFile(
    rawFilePath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        ...snapshot,
      },
      null,
      2
    ),
    "utf8"
  );

  const courseCode = courseCodeFromYedionUrl(snapshot.href);
  let catalogFilePath = null;
  let parsedCourse = null;
  let parsedCourses = [];

  if (
    courseCode &&
    !snapshot.isRateLimited &&
    snapshot.href.includes("prgname=S_LOOK_FOR_NOSE") &&
    snapshot.text.includes("קורס")
  ) {
    const parsed = await parseCourseSectionsPage(tab, courseCode);
    parsedCourse = {
      courseCode,
      name: parsed.name || courseCode,
      taughtStatus: null,
      firstLetter: null,
      academicYearLabel: parsed.academicYearLabel ?? null,
      syllabusText: parsed.syllabusText ?? null,
      sourceUrl: parsed.sourceUrl ?? snapshot.href,
      detailListUrl: snapshot.href,
      sections: parsed.sections ?? [],
    };

    parsedCourses = [parsedCourse];
    const catalog = {
      scraperVersion: 1,
      source: {
        baseUrl: BASE_URL,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        academicYearLabel: parsed.academicYearLabel ?? null,
        sourceKind: "browser-backfill-current-page",
        rawFilePath,
      },
      options: {
        source: "current browser page",
        currentUrl: snapshot.href,
      },
      stats: {
        courses: 1,
        sections: parsedCourse.sections.length,
        detailedSections: 0,
      },
      courses: [parsedCourse],
    };

    const hash = crypto.createHash("sha1").update(snapshot.href).digest("hex").slice(0, 10);
    catalogFilePath = path.join(catalogDir, `catalog-backfill-${safeFilePart(courseCode)}-${hash}.json`);
    await fs.mkdir(catalogDir, { recursive: true });
    await fs.writeFile(catalogFilePath, JSON.stringify(catalog, null, 2), "utf8");
  } else if (
    !snapshot.isRateLimited &&
    snapshot.href.includes("prgname=S_LOOK_FOR_NOSE_AB") &&
    snapshot.text.includes("קוד קורס")
  ) {
    const firstLetter = letterFromYedionUrl(snapshot.href);
    parsedCourses = await parseCourseListPage(tab, firstLetter);
    const catalog = {
      scraperVersion: 1,
      source: {
        baseUrl: BASE_URL,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        academicYearLabel: null,
        sourceKind: "browser-backfill-current-list-page",
        rawFilePath,
      },
      options: {
        source: "current browser list page",
        currentUrl: snapshot.href,
        firstLetter,
      },
      stats: {
        courses: parsedCourses.length,
        sections: 0,
        detailedSections: 0,
      },
      courses: parsedCourses,
    };

    const hash = crypto.createHash("sha1").update(snapshot.href).digest("hex").slice(0, 10);
    catalogFilePath = path.join(
      catalogDir,
      `catalog-backfill-list-${safeFilePart(firstLetter)}-${hash}.json`
    );
    await fs.mkdir(catalogDir, { recursive: true });
    await fs.writeFile(catalogFilePath, JSON.stringify(catalog, null, 2), "utf8");
  }

  return {
    href: snapshot.href,
    title: snapshot.title,
    isRateLimited: snapshot.isRateLimited,
    rawFilePath,
    catalogFilePath,
    courseCode,
    courseName: parsedCourse?.name ?? null,
    sections: parsedCourse?.sections?.length ?? 0,
    syllabusChars: parsedCourse?.syllabusText?.length ?? 0,
    listCourses: parsedCourses.length,
  };
}

export const yedionScraperDefaults = {
  baseUrl: BASE_URL,
  letters: DEFAULT_HEBREW_LETTERS,
};
