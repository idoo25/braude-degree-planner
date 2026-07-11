"""Verify the 2027 Computer Science plan against Braude's public curriculum page.

Run after `npm run db:seed`. The page is the source of truth; this audit checks the
course number, name, credits, required semester, and published prerequisites.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sqlite3
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATABASE_PATH = ROOT / "data" / "degree-planner.sqlite"
REPORT_PATH = ROOT / "data" / "yearbook" / "computer-science-2027-audit.json"
SOURCE_URL = "https://w3.braude.ac.il/comp-sci-plan/"
PROGRAM_ID = "computer-science-2027"

# The official page has two internal inconsistencies. The corrections preserve the
# course named in the same row, while accepting the previous-course code for transfer
# students in the operating-systems prerequisite.
SOURCE_PREREQUISITE_CORRECTIONS = {
    "61751": {"65003": "65004"},
}
EXPECTED_ENGLISH_RULE_SETS = (
    frozenset(("11063", "ENG_BASIC_OK")),
    frozenset(("11064", "ENG_ADV_A_OK")),
    frozenset(("11063", "ENG_ADV_A_OK")),
    frozenset(("11060", "ENG_ADV_B_OK")),
    frozenset(("11063", "ENG_ADV_B_OK")),
    frozenset(("11064", "ENG_ADV_B_OK")),
    frozenset(("ENG_BASIC_OK", "ENG_ADV_A_OK", "ENG_ADV_B_OK")),
)


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self._table: list[list[str]] | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._sup_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "sup":
            self._sup_depth += 1
        elif tag == "table":
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []
        elif tag == "br" and self._cell is not None:
            self._cell.append(" ")

    def handle_data(self, data: str) -> None:
        if self._cell is not None and self._sup_depth == 0:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "sup":
            self._sup_depth = max(0, self._sup_depth - 1)
        elif tag in {"td", "th"} and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None and self._table is not None:
            self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            self.tables.append(self._table)
            self._table = None


def normalize_name(value: str) -> str:
    value = html.unescape(value).replace("׳", "'").replace("״", '"')
    value = re.sub(r"\s+", " ", value).strip()
    return re.sub(r"\s+\d+$", "", value)


def parse_credits(value: str) -> float:
    value = value.replace("–", "").strip()
    return float(value) if value else 0.0


def fetch_source_tables() -> list[dict[str, object]]:
    request = Request(SOURCE_URL, headers={"User-Agent": "BraudeDegreePlanner curriculum audit"})
    with urlopen(request, timeout=30) as response:
        page = response.read().decode("utf-8", errors="replace")

    parser = TableParser()
    parser.feed(page)
    if len(parser.tables) < 8:
        raise RuntimeError(f"Expected 8 curriculum tables, found {len(parser.tables)}")

    courses: list[dict[str, object]] = []
    for table_index, table in enumerate(parser.tables[:8]):
        for row in table:
            if len(row) < 6 or not re.fullmatch(r"\d{5,6}", row[0].strip()):
                continue
            course_id = row[0].strip()
            prerequisite_ids = re.findall(r"\b\d{5,6}\b", row[6] if len(row) > 6 else "")
            courses.append(
                {
                    "id": course_id,
                    "name": normalize_name(row[1]),
                    "credits": parse_credits(row[5]),
                    "semester": table_index + 1 if table_index < 6 else None,
                    "prerequisites": prerequisite_ids,
                }
            )
    return courses


def load_database_courses(connection: sqlite3.Connection) -> dict[str, dict[str, object]]:
    rows = connection.execute(
        """
        SELECT id, name, credits, semester, metadata_json
        FROM courses
        WHERE program_id = ?
        """,
        (PROGRAM_ID,),
    ).fetchall()
    courses = {
        row[0]: {
            "name": normalize_name(row[1]),
            "credits": float(row[2]),
            "semester": row[3],
            "satisfiesCourseId": json.loads(row[4]).get("satisfiesCourseId"),
        }
        for row in rows
    }
    prerequisites: dict[str, set[str]] = {}
    for course_id, prerequisite_id in connection.execute(
        """
        SELECT groups.course_id, items.prerequisite_course_id
        FROM course_prerequisite_groups AS groups
        JOIN course_prerequisite_items AS items ON items.group_id = groups.id
        WHERE groups.program_id = ?
        """,
        (PROGRAM_ID,),
    ):
        prerequisites.setdefault(course_id, set()).add(prerequisite_id)

    for course_id, course in courses.items():
        course["prerequisites"] = prerequisites.get(course_id, set())
    return courses


def load_english_rule_sets(connection: sqlite3.Connection) -> set[frozenset[str]]:
    rows = connection.execute(
        """
        SELECT payload_json
        FROM degree_rules
        WHERE program_id = ? AND type = 'mutual_exclusion' AND enabled = 1
        """,
        (PROGRAM_ID,),
    ).fetchall()
    return {
        frozenset(payload.get("courseIds", []))
        for (payload_json,) in rows
        if isinstance((payload := json.loads(payload_json)), dict)
        and payload.get("maxSelected") == 1
    }


def audit() -> dict[str, object]:
    if not DATABASE_PATH.exists():
        raise RuntimeError(f"Database not found: {DATABASE_PATH}. Run npm run db:seed first.")

    source_courses = fetch_source_tables()
    connection = sqlite3.connect(DATABASE_PATH)
    try:
        database_courses = load_database_courses(connection)
        english_rule_sets = load_english_rule_sets(connection)
    finally:
        connection.close()

    mismatches: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for source_course in source_courses:
        course_id = str(source_course["id"])
        if course_id in seen_ids:
            continue
        seen_ids.add(course_id)
        database_course = database_courses.get(course_id)
        if database_course is None:
            mismatches.append({"courseId": course_id, "field": "missing", "source": source_course})
            continue

        for field in ("name", "credits", "semester"):
            if database_course[field] != source_course[field]:
                mismatches.append(
                    {
                        "courseId": course_id,
                        "field": field,
                        "source": source_course[field],
                        "database": database_course[field],
                    }
                )

        source_prerequisites = set(source_course["prerequisites"])
        for old_id, new_id in SOURCE_PREREQUISITE_CORRECTIONS.get(course_id, {}).items():
            source_prerequisites.discard(old_id)
            source_prerequisites.add(new_id)
        missing_prerequisites = sorted(source_prerequisites - database_course["prerequisites"])
        if missing_prerequisites:
            mismatches.append(
                {
                    "courseId": course_id,
                    "field": "prerequisites",
                    "source": sorted(source_prerequisites),
                    "database": sorted(database_course["prerequisites"]),
                    "missing": missing_prerequisites,
                }
            )

    if database_courses.get("ENG_ADV_B_OK", {}).get("satisfiesCourseId") != "11060":
        mismatches.append(
            {
                "courseId": "ENG_ADV_B_OK",
                "field": "satisfiesCourseId",
                "source": "11060",
                "database": database_courses.get("ENG_ADV_B_OK", {}).get("satisfiesCourseId"),
            }
        )

    for expected_rule_set in EXPECTED_ENGLISH_RULE_SETS:
        if expected_rule_set not in english_rule_sets:
            mismatches.append(
                {
                    "courseId": "english-logic",
                    "field": "mutualExclusion",
                    "source": sorted(expected_rule_set),
                    "database": [sorted(rule_set) for rule_set in english_rule_sets],
                }
            )

    return {
        "programId": PROGRAM_ID,
        "sourceUrl": SOURCE_URL,
        "sourceCourseCount": len(seen_ids),
        "mismatchCount": len(mismatches),
        "mismatches": mismatches,
        "sourcePrerequisiteCorrections": SOURCE_PREREQUISITE_CORRECTIONS,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fail-on-mismatch", action="store_true")
    args = parser.parse_args()

    report = audit()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Computer Science 2027 audit: {report['sourceCourseCount']} source courses, "
        f"{report['mismatchCount']} mismatches."
    )
    print(f"Report: {REPORT_PATH}")
    return 1 if args.fail_on_mismatch and report["mismatchCount"] else 0


if __name__ == "__main__":
    sys.exit(main())
