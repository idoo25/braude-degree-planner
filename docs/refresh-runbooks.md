# Refresh Runbooks — keeping the site current year over year

Two kinds of change hit this app on a schedule, and the architecture handles each
differently:

| Change | Cadence | Data layer | Refresh path |
|---|---|---|---|
| New yearbook (שנתון): curriculum, rules, programs open/close | Yearly | `database/seed/programs/*.ts` → curriculum tables | Add/edit program files, reseed |
| New schedule (מערכת): sections, lecturers, rooms, exams open/close | Every semester | `data/yedion/catalog-current.json` → `yedion_*` tables | Re-scrape, re-import |

The two layers are intentionally decoupled: curriculum is versioned per yearbook
edition and changes rarely; the Yedion schedule is a **replaceable snapshot** that is
fully rebuilt on every refresh. They meet only at query time, joined on course code
(with `yedion_code_aliases` bridging renumbered courses).

---

## Runbook A — yearly yearbook refresh (שנתון חדש)

**Principle: a new yearbook edition is a NEW program file, not an edit of the old
one.** Students who started under an older curriculum keep planning against it.

1. **Get the new yearbook PDF.** Save it under a backup/source folder (see
   `C:\braude_backup\...\source-documents\` for the current ones).

2. **Extract the curriculum per program.** The reliable method (used for all 15
   current programs, documented per-program in `docs/degree-programs/*.md`):
   - Plain-text extraction loses the underline that marks a corequisite (קורס צמוד).
     Render each semester-table page as an image (PyMuPDF `page.get_pixmap(matrix=fitz.Matrix(3,3))`)
     and visually identify underlined entries in the "קורסי קדם וקורסים צמודים" column.
   - Underlined = `coRequisites`; plain = `prerequisites`. Transcribe footnotes —
     they carry mutual-exclusion rules and cohort-conditional prerequisites.

3. **Create the new program file** at `database/seed/programs/<program>-<edition>.ts`
   (e.g. `civil-engineering-2027.ts`), copying the shape of an existing file. Set:
   - a NEW unique `id` (e.g. `"civil-engineering-2027"`),
   - `catalogYear: 'תשפ"ז (2026-2027)'`,
   - `status: "active"`.

4. **Retire the old edition (don't delete it):** in the previous file set
   `status: "archived"`. It moves to the "תוכניות שנסגרו / מהדורות קודמות" section of
   the picker; existing users' saved plans (keyed by program id in localStorage)
   keep working. A program that closed entirely just gets archived with no successor.

5. **Reseed and verify:**
   ```powershell
   npm run db:seed
   $py = 'C:\Users\Dorit\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
   & $py scripts\audit-yearbook-2026.py --fail-on-mismatch
   python scripts\audit-computer-science-2027.py --fail-on-mismatch # website-sourced תשפ"ז Computer Science B.Sc.
   npm run lint
   npm run build
   ```
   `seed-db.mjs` auto-discovers every file in `database/seed/programs/` — no
   registration step. The yearbook audit writes
   `data/yearbook/2026-curriculum-audit.json` and fails on a missing course, course
   number mismatch, incorrect semester, credits, prerequisite/corequisite, or a
   stale course in a current Master/catalog edition. Check the picker shows the new
   edition and the old one under the archive section.

6. **Course renumbering:** if the new yearbook renumbered courses relative to what
   Yedion uses, add entries to `database/seed/shared/yedion-code-aliases.json`
   (curriculum id → Yedion code, matched by exact Hebrew course name). Reseed.
   Rule of thumb: after seeding, run the coverage query in
   `scripts/audit-yedion-data.mjs` (`npm run yedion:audit`) — a mandatory course with
   zero offerings usually means a missing alias.

7. **Rules/regulations changes** (נוהל אקדמי): mutual-exclusion and similar
   constraints live per-program in each file's `rules[]`; global behavioral rules
   (e.g. corequisite semantics) live in `src/lib/degree-audit.ts`. Prefer expressing
   new constraints as data (`rules[]`) over code.

### Evidence from the 2025-2026 edition

The 2025-2026 extraction is stored in
`data/yearbook/shnaton-2026-extraction.json`. Generate it from the supplied PDF
with the bundled Python runtime:

```powershell
$py = 'C:\Users\Dorit\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $py scripts/extract-yearbook-pdf.py `
  --input 'C:\Users\Dorit\Downloads\shnaton_2026_toweb-1.pdf' `
  --output 'data\yearbook\shnaton-2026-extraction.json'
```

The extractor uses the PDF tables directly and records the source pages for every
course row. It is deliberately evidence-only: visually inspect underlined
corequisites and footnotes before adding or changing rules in a seed file.

For this edition, 13 programs have active `-2026` versions. The preceding
editions are retained as archived programs. Civil Engineering is newly opened in
the yearbook and is labelled accordingly in `civil-engineering-2026.ts`; the
yearbook states that its degree award is subject to approval by the Council for
Higher Education.

---

## Runbook B — semesterly schedule refresh (מערכת חדשה)

**Principle: the `yedion_*` layer is a snapshot — rebuild it, don't patch it.**

1. **Scrape.** The Braude site blocks non-browser HTTP clients and rate-limits
   aggressively. Scraping MUST run from an authenticated in-app browser session,
   serially, with spacing — the working method, worker commands, and resume flow are
   in `docs/yedion-data-pipeline.md`. Never probe or bypass a cooldown; if the site
   shows a rate-limit page, stop and resume after the stated reset time.
   ```powershell
   npm run yedion:worker -- --rpm=25     # after manual sign-in in the visible browser
   ```

2. **Merge + import:**
   ```powershell
   npm run yedion:merge
   npm run yedion:import:reset -- --input=data\yedion\catalog-current.json
   npm run yedion:import-search          # if the broad day/hour + exam searches were re-run
   ```
   The import replaces the previous snapshot. Courses that closed disappear from
   offerings automatically; new courses appear as soon as their curriculum course id
   (or an alias) matches.

3. **Audit:**
   ```powershell
   npm run yedion:report                 # coverage counts
   npm run yedion:audit                  # data-quality report -> data/yedion/quality-report.json
   ```
   Watch for: courses stuck `time-unpublished` (times not yet published — normal
   early in the registration period), unresolved section links, and degree-plan
   courses with zero offerings (possible renumbering → Runbook A step 6).

4. **Ship:** commit `data/degree-planner.sqlite` + `data/yedion/catalog-current.json`
   and push. Vercel redeploys automatically; the serverless functions read the
   SQLite file directly, so the deployed site updates with no further steps.

---

## What stays stable across both refreshes

- App code (`src/`) is data-driven: no course codes, program ids, or years are
  hardcoded in components/APIs (the Braude bell schedule in the timetable grid is
  the one institution-level constant).
- localStorage keys are namespaced per program id, so archived programs' saved
  plans survive upgrades.
- The audit engine consumes whatever `rules[]`/`prerequisites`/`coRequisites` the
  seed provides — new constraint types should follow that pattern.
