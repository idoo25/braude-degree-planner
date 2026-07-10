import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const BASE_URL = "https://info.braude.ac.il/yedion/fireflyweb.aspx";
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function buildUrl(prgname, args = "") {
  const url = new URL(BASE_URL);
  url.searchParams.set("prgname", prgname);
  if (args) {
    url.searchParams.set("arguments", args);
  }
  return url.toString();
}

function numericArgument(value) {
  return `-N${String(value).trim()}`;
}

function buildNumericUrl(prgname, values) {
  return buildUrl(prgname, values.map(numericArgument).join(","));
}

async function getTab(browser) {
  const selected = await browser.tabs.selected();
  if (selected) {
    return selected;
  }

  const tabs = await browser.tabs.list();
  return tabs.length ? browser.tabs.get(tabs[0].id) : browser.tabs.new();
}

async function readPageState(tab) {
  return tab.playwright.evaluate(() => {
    const text = (document.body?.innerText || document.body?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    return {
      href: location.href,
      title: document.title || "",
      text,
      textSample: text.slice(0, 1600),
    };
  });
}

function isRateLimited(pageState) {
  const text = `${pageState?.title || ""} ${pageState?.text || ""}`;
  return /השהיית גישה זמנית|יותר מדי שאילתות|ניתן לנסות שוב|rate.?limit/i.test(text);
}

function isLoggedOut(pageState) {
  const text = `${pageState?.title || ""} ${pageState?.text || ""}`;
  return /Braude Gateway|Citrix|User name|Password|OTP|סיסמה|התחברות/i.test(text);
}

async function waitForYedionPage(tab, requestedUrl) {
  const startedAt = Date.now();
  let pageState = await readPageState(tab);
  while (Date.now() - startedAt < DEFAULT_NAVIGATION_TIMEOUT_MS) {
    pageState = await readPageState(tab);
    if (pageState.text && pageState.href) {
      break;
    }
    await sleep(500);
  }

  if (!pageState.href.includes("/yedion/fireflyweb.aspx")) {
    if (isLoggedOut(pageState)) {
      throw new Error("Yedion session requires login before continuing.");
    }
    throw new Error(`Unexpected page after request: ${pageState.href || requestedUrl}`);
  }

  if (isLoggedOut(pageState)) {
    throw new Error("Yedion session requires login before continuing.");
  }

  if (isRateLimited(pageState)) {
    throw new Error("Yedion showed a rate-limit/delay page. Stopping without retry.");
  }

  return pageState;
}

async function cacheCurrentPage(tab, requestedUrl, pageCacheDir, index) {
  if (!pageCacheDir) {
    return null;
  }

  const snapshot = await tab.playwright.evaluate(() => {
    const text = (document.body?.innerText || document.body?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    return {
      capturedAt: new Date().toISOString(),
      href: location.href,
      title: document.title || "",
      text,
      html: document.documentElement?.outerHTML || "",
    };
  });

  await fs.mkdir(pageCacheDir, { recursive: true });
  const filePath = path.join(pageCacheDir, pageCacheFileName(requestedUrl, index));
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        requestedUrl,
        ...snapshot,
      },
      null,
      2
    ),
    "utf8"
  );
  return filePath;
}

async function createNavigator(tab, { requestDelayMs, pageCacheDir, onProgress }) {
  let lastRequestAt = 0;
  let pageCacheIndex = 0;

  async function waitForDelay() {
    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt && elapsed < requestDelayMs) {
      await sleep(requestDelayMs - elapsed);
    }
  }

  async function goto(url, meta = {}) {
    await waitForDelay();
    await tab.goto(url);
    const pageState = await waitForYedionPage(tab, url);
    lastRequestAt = Date.now();
    pageCacheIndex += 1;
    const rawFilePath = await cacheCurrentPage(tab, url, pageCacheDir, pageCacheIndex);
    onProgress?.({
      at: new Date().toISOString(),
      stage: "page",
      url: pageState.href,
      requestedUrl: url,
      rawFilePath,
      ...meta,
    });
    return { pageState, rawFilePath };
  }

  async function clickWithNavigation(locator, requestedUrl, meta = {}) {
    await waitForDelay();
    await locator.click({ timeoutMs: 10000 });
    const pageState = await waitForYedionPage(tab, requestedUrl);
    lastRequestAt = Date.now();
    pageCacheIndex += 1;
    const rawFilePath = await cacheCurrentPage(tab, requestedUrl, pageCacheDir, pageCacheIndex);
    onProgress?.({
      at: new Date().toISOString(),
      stage: "page",
      url: pageState.href,
      requestedUrl,
      rawFilePath,
      ...meta,
    });
    return { pageState, rawFilePath };
  }

  return { goto, clickWithNavigation };
}

async function readEnterSearchOptions(tab) {
  return tab.playwright.evaluate(() => {
    function cleanLocal(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    return {
      href: location.href,
      controls: Array.from(document.querySelectorAll("select")).map((select) => ({
        id: select.id,
        name: select.name,
        value: select.value,
        label:
          cleanLocal(
            document.querySelector(`label[for="${select.id}-ts-control"], label[for="${select.id}"]`)
              ?.textContent
          ) || null,
        options: Array.from(select.options).map((option) => ({
          value: option.value,
          text: cleanLocal(option.textContent),
          selected: option.selected,
          disabled: option.disabled,
          hidden: option.hidden,
        })),
      })),
      buttons: Array.from(document.querySelectorAll("button[data-progname]")).map((button) => ({
        text: cleanLocal(button.textContent),
        name: button.name || null,
        progname: button.dataset.progname || null,
        arguments: button.dataset.arguments || null,
      })),
    };
  });
}

async function setAcademicYear(tab, navigator, academicYearValue, { yearSelectIds = ["ChangeYear", "R1C39"] } = {}) {
  await navigator.goto(buildUrl("Enter_Search"), { searchKind: "enter-search" });

  for (const selectId of yearSelectIds) {
    const locator = tab.playwright.locator(`select#${selectId}`);
    const count = await locator.count();
    if (count !== 1) {
      continue;
    }

    await locator.selectOption(academicYearValue, { timeoutMs: 10000 });
    const button = tab.playwright.locator(
      `button[data-progname="Enter_Search"][data-arguments*="${selectId}"]`
    );
    const buttonCount = await button.count();
    if (buttonCount === 1) {
      await navigator.clickWithNavigation(button, buildUrl("Enter_Search"), {
        searchKind: "set-year",
        selectId,
        academicYearValue,
      });
      return selectId;
    }
  }

  return null;
}

function controlById(searchOptions, id) {
  return (searchOptions.controls ?? []).find((control) => control.id === id);
}

function usableOptions(control) {
  return (control?.options ?? []).filter(
    (option) => !option.disabled && !option.hidden && option.value !== ""
  );
}

function parseLabeledCells(cells) {
  const fields = {};
  for (const cell of cells) {
    const text = clean(cell);
    const colonIndex = text.indexOf(":");
    if (colonIndex <= 0) {
      continue;
    }
    const label = clean(text.slice(0, colonIndex));
    const value = clean(text.slice(colonIndex + 1));
    if (label && value) {
      fields[label] = value;
    }
  }
  return fields;
}

function findField(fields, fragments) {
  const entry = Object.entries(fields).find(([label]) =>
    fragments.some((fragment) => label.includes(fragment))
  );
  return entry?.[1] ?? null;
}

function parseDayTime(text) {
  const value = clean(text);
  const timeMatch = value.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  const dayMatch = value.match(/יום\s+[א-ת]+|^[אבגדהו]/);
  return {
    dayOfWeek: dayMatch?.[0] ?? null,
    startTime: timeMatch?.[1] ?? null,
    endTime: timeMatch?.[2] ?? null,
  };
}

async function parseDayHourResults(tab, searchMeta) {
  return tab.playwright.evaluate(
    ({ searchMetaInput }) => {
      function cleanLocal(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
      }

      function parseLabeledCellsLocal(cells) {
        const fields = {};
        for (const cell of cells) {
          const text = cleanLocal(cell);
          const colonIndex = text.indexOf(":");
          if (colonIndex <= 0) continue;
          const label = cleanLocal(text.slice(0, colonIndex));
          const value = cleanLocal(text.slice(colonIndex + 1));
          if (label && value) fields[label] = value;
        }
        return fields;
      }

      function findFieldLocal(fields, fragments) {
        const entry = Object.entries(fields).find(([label]) =>
          fragments.some((fragment) => label.includes(fragment))
        );
        return entry?.[1] || null;
      }

      function parseDayTimeLocal(text) {
        const value = cleanLocal(text);
        const timeMatch = value.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
        const dayMatch = value.match(/יום\s+[א-ת]+|^[אבגדהו]/);
        return {
          dayOfWeek: dayMatch?.[0] || null,
          startTime: timeMatch?.[1] || null,
          endTime: timeMatch?.[2] || null,
        };
      }

      const rows = Array.from(document.querySelectorAll(".row.Tr, tr"))
        .map((row) => {
          const cells = Array.from(row.children)
            .map((cell) => cleanLocal(cell.innerText || cell.textContent))
            .filter(Boolean);
          const rowText = cleanLocal(row.innerText || row.textContent);
          const link = row.querySelector(
            '[data-progname="S_LOOK_FOR_NOSE"], [data-progname="S_CourseDetails"], a[href*="S_LOOK_FOR_NOSE"], a[href*="S_CourseDetails"]'
          );
          const rawArguments =
            link?.getAttribute("data-arguments") ||
            (link?.getAttribute("href") || "").match(/[?&]arguments=([^&#]+)/)?.[1] ||
            null;
          const fields = parseLabeledCellsLocal(cells);
          const dayTimeText =
            findFieldLocal(fields, ["יום ושעות", "יום", "שעות"]) ||
            cells.find((cell) => /\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/.test(cell)) ||
            "";
          const parsedDayTime = parseDayTimeLocal(dayTimeText || rowText);
          const courseCode =
            findFieldLocal(fields, ["קוד קורס", "קוד נושא"]) ||
            (rawArguments || "").match(/-N(\d+)/)?.[1] ||
            rowText.match(/\b\d{4,6}\b/)?.[0] ||
            null;
          const groupText = findFieldLocal(fields, ["קבוצה"]) || "";
          const groupMatch = groupText.match(/(\d+)(?:\s*\/\s*(\d+))?/);

          if (!courseCode && !cells.length) {
            return null;
          }

          return {
            courseCode,
            courseName: findFieldLocal(fields, ["שם קורס", "שם נושא"]),
            semesterPeriod: findFieldLocal(fields, ["סמסטר"]) || searchMetaInput.semesterText || null,
            sectionType: findFieldLocal(fields, ["סוג מקצוע", "סוג קורס", "סוג"]),
            groupCode: groupMatch?.[1] || null,
            groupNumber: groupMatch?.[2] || null,
            dayOfWeek: findFieldLocal(fields, ["יום בשבוע"]) || parsedDayTime.dayOfWeek,
            startTime: findFieldLocal(fields, ["שעת התחלה"]) || parsedDayTime.startTime,
            endTime: findFieldLocal(fields, ["שעת סיום"]) || parsedDayTime.endTime,
            lecturerName: findFieldLocal(fields, ["מרצה"]),
            room: findFieldLocal(fields, ["חדר לימוד", "כיתה", "חדר"]),
            rawArguments,
            rawCells: cells,
            rawText: rowText,
          };
        })
        .filter(Boolean);

      return {
        href: location.href,
        title: document.title || "",
        text: cleanLocal(document.body?.innerText || document.body?.textContent || ""),
        rows,
      };
    },
    { searchMetaInput: searchMeta }
  );
}

async function parseExamResults(tab, searchMeta) {
  return tab.playwright.evaluate(
    ({ searchMetaInput }) => {
      function cleanLocal(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
      }

      function parseDate(value) {
        const match = cleanLocal(value).match(/(\d{2})\/(\d{2})\/(\d{4})/);
        return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
      }

      function parseLabeledCellsLocal(cells) {
        const fields = {};
        for (const cell of cells) {
          const text = cleanLocal(cell);
          const colonIndex = text.indexOf(":");
          if (colonIndex <= 0) continue;
          const label = cleanLocal(text.slice(0, colonIndex));
          const value = cleanLocal(text.slice(colonIndex + 1));
          if (label && value) fields[label] = value;
        }
        return fields;
      }

      function findFieldLocal(fields, fragments) {
        const entry = Object.entries(fields).find(([label]) =>
          fragments.some((fragment) => label.includes(fragment))
        );
        return entry?.[1] || null;
      }

      const rows = Array.from(document.querySelectorAll(".row.Tr, tr"))
        .map((row) => {
          const cells = Array.from(row.children)
            .map((cell) => cleanLocal(cell.innerText || cell.textContent))
            .filter(Boolean);
          const rowText = cleanLocal(row.innerText || row.textContent);
          const fields = parseLabeledCellsLocal(cells);
          const courseCode =
            findFieldLocal(fields, ["קוד קורס", "קוד נושא"]) ||
            rowText.match(/\b\d{4,6}\b/)?.[0] ||
            null;
          const dateText =
            findFieldLocal(fields, ["תאריך בחינה", "תאריך"]) ||
            cells.find((cell) => /\d{2}\/\d{2}\/\d{4}/.test(cell)) ||
            rowText;
          const timeText =
            findFieldLocal(fields, ["שעת בחינה", "שעה"]) ||
            cells.find((cell) => /\b\d{2}:\d{2}\b/.test(cell)) ||
            rowText;

          if (!courseCode && !/\d{2}\/\d{2}\/\d{4}/.test(rowText)) {
            return null;
          }

          return {
            majorValue: searchMetaInput.majorValue,
            majorText: searchMetaInput.majorText,
            courseCode,
            courseName: findFieldLocal(fields, ["שם קורס", "שם נושא"]),
            semester: findFieldLocal(fields, ["סמסטר"]) || searchMetaInput.semesterText || null,
            academicYear: findFieldLocal(fields, ["שנה"]) || searchMetaInput.academicYearText || null,
            termLabel: findFieldLocal(fields, ["מועד"]),
            examKind: findFieldLocal(fields, ["סוג בחינה", "סוג"]),
            examDate: parseDate(dateText),
            examTime: timeText.match(/\b\d{2}:\d{2}\b/)?.[0] || null,
            room: findFieldLocal(fields, ["חדר", "כיתה"]),
            lecturerName: findFieldLocal(fields, ["מרצה"]),
            rawCells: cells,
            rawText: rowText,
          };
        })
        .filter(Boolean);

      return {
        href: location.href,
        title: document.title || "",
        text: cleanLocal(document.body?.innerText || document.body?.textContent || ""),
        rows,
      };
    },
    { searchMetaInput: searchMeta }
  );
}

export async function scrapeYedionDayHourAndExams({
  browser,
  outputDir = "C:/school/braude-degree-planner/data/yedion/search",
  academicYearValue = "2026",
  semesterValues = ["1", "2"],
  dayValue = "7",
  requestDelayMs = 5000,
  pageCacheDir = null,
  includeDayHour = true,
  includeExams = true,
  maxHourOptions = null,
  maxMajors = null,
  onProgress = null,
} = {}) {
  if (!browser) {
    throw new Error("A connected in-app browser is required.");
  }

  const startedAt = new Date().toISOString();
  const tab = await getTab(browser);
  const resolvedPageCacheDir = pageCacheDir ?? path.join(outputDir, "page-cache");
  const navigator = await createNavigator(tab, {
    requestDelayMs,
    pageCacheDir: resolvedPageCacheDir,
    onProgress,
  });

  const yearSelectId = await setAcademicYear(tab, navigator, academicYearValue);
  await navigator.goto(buildUrl("Enter_Search"), { searchKind: "enter-search-options" });
  const searchOptions = await readEnterSearchOptions(tab);

  const semesterControl = controlById(searchOptions, "R1C7");
  const dayControl = controlById(searchOptions, "R1C5");
  const hourControl = controlById(searchOptions, "R1C6");
  const majorControl = controlById(searchOptions, "R1C28");
  const examSemesterControl = controlById(searchOptions, "R1C29");
  const academicYearControl = controlById(searchOptions, "R1C30");

  const hourOptions = usableOptions(hourControl)
    .filter((option) => option.value !== "0")
    .slice(0, maxHourOptions ?? undefined);
  const timeSemesters = semesterValues.map((value) => {
    const option = usableOptions(semesterControl).find((candidate) => candidate.value === value);
    return { value, text: option?.text ?? value };
  });
  const dayOption = usableOptions(dayControl).find((option) => option.value === dayValue);

  const dayHourSearches = [];
  if (includeDayHour) {
    for (const semester of timeSemesters) {
      for (const hour of hourOptions) {
        const requestedUrl = buildNumericUrl("S_YFineDate", [semester.value, dayValue, hour.value]);
        const { rawFilePath } = await navigator.goto(requestedUrl, {
          searchKind: "day-hour",
          semesterValue: semester.value,
          hourValue: hour.value,
        });
        const parsed = await parseDayHourResults(tab, {
          academicYearValue,
          semesterValue: semester.value,
          semesterText: semester.text,
          dayValue,
          dayText: dayOption?.text ?? dayValue,
          hourValue: hour.value,
          hourText: hour.text,
        });
        dayHourSearches.push({
          academicYearValue,
          semesterValue: semester.value,
          semesterText: semester.text,
          dayValue,
          dayText: dayOption?.text ?? dayValue,
          hourValue: hour.value,
          hourText: hour.text,
          requestedUrl,
          resultUrl: parsed.href,
          rawFilePath,
          rows: parsed.rows,
        });
        onProgress?.({
          at: new Date().toISOString(),
          stage: "day-hour-result",
          semesterValue: semester.value,
          hourValue: hour.value,
          rows: parsed.rows.length,
        });
      }
    }
  }

  const examSearches = [];
  if (includeExams) {
    const majorOptions = usableOptions(majorControl).slice(0, maxMajors ?? undefined);
    const allSemesterOption =
      usableOptions(examSemesterControl).find((option) => option.value === "0") ??
      usableOptions(examSemesterControl)[0];
    const allAcademicYearsOption =
      usableOptions(academicYearControl).find((option) => option.value === "0") ??
      usableOptions(academicYearControl)[0];

    for (const major of majorOptions) {
      const semesterValue = allSemesterOption?.value ?? "0";
      const academicYearFilterValue = allAcademicYearsOption?.value ?? "0";
      const requestedUrl = buildNumericUrl("S_EXAMS", [
        major.value,
        semesterValue,
        academicYearFilterValue,
      ]);
      const { rawFilePath } = await navigator.goto(requestedUrl, {
        searchKind: "exams",
        majorValue: major.value,
      });
      const parsed = await parseExamResults(tab, {
        academicYearValue,
        majorValue: major.value,
        majorText: major.text,
        semesterValue,
        semesterText: allSemesterOption?.text ?? semesterValue,
        academicYearFilterValue,
        academicYearText: allAcademicYearsOption?.text ?? academicYearFilterValue,
      });
      examSearches.push({
        academicYearValue,
        majorValue: major.value,
        majorText: major.text,
        semesterValue,
        semesterText: allSemesterOption?.text ?? semesterValue,
        academicYearFilterValue,
        academicYearText: allAcademicYearsOption?.text ?? academicYearFilterValue,
        requestedUrl,
        resultUrl: parsed.href,
        rawFilePath,
        rows: parsed.rows,
      });
      onProgress?.({
        at: new Date().toISOString(),
        stage: "exam-result",
        majorValue: major.value,
        rows: parsed.rows.length,
      });
    }
  }

  const result = {
    scraperVersion: 1,
    source: {
      baseUrl: BASE_URL,
      sourceKind: "yedion-enter-search-day-hour-exams",
      startedAt,
      finishedAt: new Date().toISOString(),
      academicYearValue,
    },
    options: {
      academicYearValue,
      yearSelectId,
      semesterValues,
      dayValue,
      requestDelayMs,
      pageCacheDir: resolvedPageCacheDir,
      includeDayHour,
      includeExams,
      maxHourOptions,
      maxMajors,
      searchOptions,
    },
    stats: {
      dayHourSearches: dayHourSearches.length,
      dayHourRows: dayHourSearches.reduce((sum, search) => sum + search.rows.length, 0),
      examSearches: examSearches.length,
      examRows: examSearches.reduce((sum, search) => sum + search.rows.length, 0),
    },
    dayHourSearches,
    examSearches,
  };

  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `yedion-day-hour-exams-${academicYearValue}.json`);
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
  onProgress?.({
    at: new Date().toISOString(),
    stage: "done",
    outputPath,
    ...result.stats,
  });

  return { outputPath, ...result };
}

export const yedionSearchScraperDefaults = {
  baseUrl: BASE_URL,
  outputDir: "C:/school/braude-degree-planner/data/yedion/search",
};
