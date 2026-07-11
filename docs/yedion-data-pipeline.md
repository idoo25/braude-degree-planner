# Yedion data pipeline

## Current state

The timetable app should not be built directly from live Yedion pages. First we keep a local catalog:

- Raw merged catalog: `data/yedion/catalog-current.json`
- SQLite DB: `data/degree-planner.sqlite`
- Yedion schema: `database/schema/yedion-catalog.sql`
- Future raw page snapshots: `data/yedion/page-cache/`

Current imported data after the complete catalog and course-semester enrichment:

- 583 courses
- 2,520 course sections
- 2,796 section meetings
- 893 / 893 course-semester groups with at least one captured detail page
- 930 raw detail exam rows and 1,109 canonical exam slots after duplicate merging
- 488 syllabus rows
- 626 section link rows: 591 resolved and 35 currently unresolved because the linked group is absent
- 2,547 raw course dependency relations; these are retained as source metadata, while the degree-plan rules remain the authority for legal course selection

## What happened

The broad crawl requested many Yedion pages quickly. Yedion responded with:

`השהיית גישה זמנית ... יותר מידי שאילתות בשעה ... ניתן לנסות שוב החל משעה 20:00`

The visible page exposes the rate-limit window and reset time, but not the exact
number of requests allowed per hour.

The first detailed sample for course `61741` worked and includes syllabus, exam dates, linked sections, meetings, rooms, lecturers, and full-status flags. The broad crawl was intentionally run without details, so most sections still need a second enrichment pass.

The DB schema keeps two separate kinds of relationships:

- `yedion_course_relations`: course-level dependencies from the Yedion "תנאי קדם לנושא" area, including prerequisites and corequisites when those rows exist.
- `yedion_section_links`: section-level requirements from "תנאי קשר", for example a lecture that requires choosing one exercise, or an exercise that requires choosing one lab.

Derived views make those relationships queryable in both directions:

- `yedion_course_dependency_edges`: normalized course dependency edges, so a query can ask either "what does this course require?" or "which courses require this course?"
- `yedion_section_required_options`: source section to required section options, including matched timetable rows when the linked section is already imported.
- `yedion_course_required_component_types`: compact summary such as lecture -> exercise or exercise -> lab.
- `yedion_room_busy_windows` and `yedion_lecturer_busy_windows`: normalized day/time windows for reverse availability searches.
- `yedion_section_schedule_quality`: distinguishes usable schedules from sections with no published time or no meetings.
- `yedion_section_link_resolution`: reports whether a required linked component can be matched locally.
- `yedion_exam_slots`: deduplicates equivalent exam rows and aggregates lecturers into one canonical exam slot.
- `yedion_dependency_resolution`: makes source dependency parsing quality visible without treating it as degree-law data.

The timetable app reads these views through `src/lib/db/yedion-repository.ts` and
`src/lib/timetable-generator.ts`. Its endpoints are `/api/offerings` and
`/api/timetable`; the page is `/p/<programId>/timetable`.

The first broad crawl did not save raw HTML snapshots. Future crawls do save raw
page snapshots by default, so parser misses can be fixed offline without asking
Yedion for the same page again.

Browser Back was later used to recover pages from the browser history/cache.
That backfill recovered 38 course pages and the letter Mem list page with 169
course rows. Backfill output is under `data/yedion/backfill/` and raw page
snapshots are under `data/yedion/page-cache/backfill/`.

The later enrichment pass used the user's requested fixed serial rate:
`requestDelayMs: 5000`, `requestJitterMs: 0`, no parallel browser requests.
The efficient resume path is to pass only the next missing `courseCodes`, not to
scan from a broad `startAfterCourseCode`. The scraper also normalizes Hebrew
semester labels and numeric semester codes to the same key, so semester B and
semester `2` do not appear as separate missing groups.

## Local commands

Merge all saved catalog fragments:

```powershell
npm run yedion:merge
```

Import the merged catalog into SQLite:

```powershell
npm run yedion:import:reset -- --input=data\yedion\catalog-current.json
```

Print DB coverage and the next missing detail rows:

```powershell
npm run yedion:report
npm run yedion:audit
```

`npm run yedion:audit` writes `data/yedion/quality-report.json`, including detail-page
coverage, schedule-status totals, link resolution, dependency parsing quality, and
degree-plan offering coverage.

## Current enrichment run

Run enrichment from the signed-in in-app browser session, not from a fresh
unauthenticated terminal. The current user-selected rate is serial 5-second
spacing: no parallel requests, no jitter.

```js
var scraper = await import("file:///C:/school/braude-degree-planner/scripts/yedion-browser-scraper.mjs");
await scraper.scrapeYedionCatalog({
  browser,
  inputPath: "C:/school/braude-degree-planner/data/yedion/catalog-current.json",
  outputPath: "C:/school/braude-degree-planner/data/yedion/catalog-current.json",
  detailMode: "course-semester",
  courseCodes: ["61974", "61975", "61981"],
  maxDetailPages: 20,
  requestDelayMs: 5000,
  requestJitterMs: 0,
  rateLimitRetries: 0,
  maxRuntimeMs: 150000,
  saveEveryDetails: 1,
  cachePages: true
});
```

Then run:

```powershell
npm run yedion:merge
npm run yedion:import:reset -- --input=data\yedion\catalog-current.json
npm run yedion:report
```

`detailMode: "course-semester"` avoids opening duplicate detail pages for every
section in the same course/year/semester. Save after every detail page, and stop
immediately if Yedion shows any delay/rate-limit page. `yedion:report` may still
show individual sections without details; that is expected when another section
in the same course-semester already supplied the shared syllabus, exams, and
relationship data.
