# Braude Degree Planner

A degree-audit and planning tool for Braude College of Engineering (Carmiel). Pick a
degree program, mark the courses you've completed, and see what's left: credits
remaining, blocked/available courses, prerequisite and corequisite status, and
elective-cluster progress.

Live app: https://braude-degree-planner.vercel.app

## What's here

- **13 active 2025-2026 degree-program editions** seeded from the official yearbook,
  with older editions preserved in the archive for students who started under those
  rules. Each program has its own course list, prerequisites, corequisites, elective
  clusters, and credit requirements.
- **Program picker** at `/` — choose a program, then plan at `/p/[programId]`.
- **Corequisite-aware audit**: a corequisite never hard-blocks a course. It's satisfied
  either by prior completion or by taking it the same semester; if unmet, the UI shows
  a "recommended together" hint instead of blocking.
- **General-studies & sport electives**: real course catalogs (67 general-studies +
  39 sport courses — actual options like tennis, chess, film studies) rather than
  generic placeholder slots, with a warning if you select more than the required credits.
- A separate, much larger **Yedion schedule/exam data pipeline** (see below) that
  scrapes info.braude.ac.il for real section times, lecturers, rooms, and exam dates —
  currently only wired up for the Software Engineering program's course cards.

## Running locally

```powershell
npm install
npm run db:seed      # build data/degree-planner.sqlite from database/seed/programs/*.ts
npm run dev
```

`npm run db:seed` (see `scripts/seed-db.mjs`) compiles every `*.ts` file under
`database/seed/programs/` and loads it into SQLite — drop in a new program file and
it's picked up automatically, no registration needed elsewhere.

## Architecture

- `database/seed/programs/*.ts` — one file per degree program, each exporting a
  `degreePlan` (see `src/types/degree.ts` for the shape: courses, prerequisites,
  corequisites, elective clusters, requirement groups, mutual-exclusion rules).
- `database/seed/shared/general-and-sport-courses.json` — the shared general-studies
  and sport elective catalog, imported by every B.Sc. program's seed file.
- `scripts/seed-db.mjs` — loads all program files into `data/degree-planner.sqlite`.
- `src/lib/db/degree-repository.ts` — reads a program's full plan from SQLite.
- `src/lib/degree-audit.ts` — the audit engine: given a program plan + selected
  course IDs, computes credits completed/remaining, blocked/available courses,
  corequisite recommendations, cluster progress, and rule warnings.
- `src/app/api/{degree-plan,audit,programs}/route.ts` — API routes, all accept an
  optional `?programId=` query param (defaults to Software Engineering).
- `src/components/degree-planner.tsx` — the planner UI.

## Adding or editing a program's curriculum

Edit (or add) a file under `database/seed/programs/`, matching the existing files'
shape, then `npm run db:seed`. No other file needs to change.

For a new yearbook, first generate `data/yearbook/shnaton-2026-extraction.json` with
`scripts/extract-yearbook-pdf.py`, then create a new edition file rather than editing
the older one. The detailed process is in `docs/refresh-runbooks.md`.

The checked 2025-2026 curriculum evidence is written to
`data/yearbook/2026-curriculum-audit.json`. Run the audit against the official PDF
after every curriculum edit; it exits non-zero for a missing course, different
semester, credits, prerequisite/corequisite, or stale course in an active edition.

The new Computer Science B.Sc. curriculum is published separately on Braude's public
website for תשפ"ז (2026-2027). After reseeding it, run
`python scripts/audit-computer-science-2027.py --fail-on-mismatch`; it compares all
eight source tables against the SQLite plan and writes
`data/yearbook/computer-science-2027-audit.json`.

## The Yedion data pipeline

Separately from the curriculum data above, there's a scraper for
info.braude.ac.il/yedion that pulls real schedule sections, lecturers, rooms, and
exam dates — imported into `yedion_*` tables in the same SQLite file (distinct from
the degree-program tables). The timetable screen joins Yedion offerings with the
degree rules, so it only proposes legal courses. Full collection, quality, and resume
details are in `docs/yedion-data-pipeline.md`.

Quick reference:

```powershell
npm run yedion:merge          # merge saved catalog fragments into catalog-current.json
npm run yedion:import:reset -- --input=data\yedion\catalog-current.json
npm run yedion:report         # print current DB coverage
npm run yedion:audit          # write data/yedion/quality-report.json
```

The site is rate-limited and blocks non-browser HTTP clients — scraping must run
from an authenticated in-app browser session, serially, with request spacing. See
`docs/yedion-data-pipeline.md` for the working method. The current local catalog has
583 courses, 2,520 sections, 2,796 meetings, 1,109 deduplicated exam slots, and 488
syllabi. All 893 course-semester groups now have at least one captured detail page.
Do not probe or bypass a cooldown when refreshing the catalog.

## Other commands

```powershell
npm run build   # production build
npm run lint
npm run db:reset  # drop and rebuild data/degree-planner.sqlite from scratch
```
