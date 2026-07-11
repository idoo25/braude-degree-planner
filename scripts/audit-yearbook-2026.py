#!/usr/bin/env python3
"""Compare the active 2026 curriculum plans with Braude's official yearbook.

The audit deliberately reads the official PDF on every run. It does not use the
previous-year seed files as evidence. The B.Sc. semester tables use a stable
right-to-left layout, so their course numbers, semesters, credits, and the
numeric references in the prerequisite column can be extracted directly.

The report is evidence, not an automatic migration. A non-empty report must be
reviewed and corrected in the program seed before it may be accepted with
``--fail-on-mismatch`` in CI or during a yearly refresh.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

import pdfplumber


COURSE_CODE = re.compile(r"^\d{4,7}$")

# Printed PDF pages with the recommended B.Sc. curriculum tables. Page ranges
# intentionally exclude departmental elective catalogs: those are checked as
# availability data, not as a fixed semester placement.
BSC_PROGRAM_TABLES = {
    "civil-engineering-2026": (58, 64),
    "biotechnology-engineering-2026": (71, 74),
    "electrical-engineering-2026": (82, 84),
    "mechanical-engineering-bsc-2026": (96, 99),
    # The fixed six-semester mathematics sequence ends halfway through p. 113.
    # Pages 114-115 are specialization/elective catalogs, not a fixed sequence.
    "applied-mathematics-2026": (111, 113),
    "braude-software-2026": (120, 123),
    "information-systems-engineering-2026": (130, 133),
    "industrial-engineering-bsc-2026": (140, 143),
}

# Some tables begin or end in the middle of a printed page. These bounds keep
# fixed-degree rows separate from the specialization/elective catalogs that
# follow them on the same page.
PAGE_INITIAL_SEMESTERS = {
    ("biotechnology-engineering-2026", 73): 5,
    ("industrial-engineering-bsc-2026", 141): 2,
}
PAGE_TOP_LIMITS = {
    ("applied-mathematics-2026", 113): 500,
    # The fixed sequence ends at the table total on p. 98 and p. 99. The
    # material below starts specialization tracks, whose courses are offered
    # by track rather than assigned to one universal semester.
    ("mechanical-engineering-bsc-2026", 98): 330,
    ("mechanical-engineering-bsc-2026", 99): 390,
}

# The current edition's active programs are all covered by one of the audit
# modes below: B.Sc. geometry extraction, reviewed Master's rows, or the
# teaching/general-studies catalog assertion.
MANUAL_REVIEW_PROGRAMS: dict[str, str] = {}

# These compact Master-program tables were transcribed from their rendered
# yearbook pages. Unlike the B.Sc. tables, their columns change by program
# (winter/spring, workshops, or completion-course matrices), so a shared PDF
# geometry parser would be less reliable than these page-scoped assertions.
# Each row is (model id, semester, credits, printed PDF page). `None` credits
# means the source table intentionally does not publish a per-course value.
MASTER_PROGRAM_ROWS = {
    "msc-biotechnology-2026": [
        ("43101", 1, None, 174), ("43104", 1, None, 174),
        ("43405", 2, None, 174), ("43501", 2, None, 174),
        ("43208", 3, None, 174), ("43103", 3, None, 174), ("43113", 3, None, 174),
        ("43209", 4, None, 174), ("43114", 4, None, 174), ("43105", 4, None, 175),
        ("43203", 5, None, 175), ("43201", 5, None, 175), ("43202", 5, None, 175), ("43206", 5, None, 175),
    ],
    "msc-systems-engineering-2026": [
        ("53323", 1, 3.0, 179), ("53311", 1, 3.0, 179), ("53312", 1, 2.0, 179), ("53314", 1, 2.0, 180),
        ("53429", 2, 3.0, 180), ("53322", 2, 3.0, 180), ("53313", 2, 3.0, 180), ("53324", 2, 0.0, 180),
        ("53344", 3, 3.0, 180), ("53428", 3, 3.0, 180), ("53422", 3, 3.0, 180), ("53333", 3, 3.0, 180),
        ("53342", 4, 3.0, 180), ("53334", 4, 3.0, 180),
    ],
    "msc-software-engineering-2026": [
        ("63010", 1, 3.0, 183), ("63011", 1, 3.0, 183),
        ("63012", 2, 3.0, 183), ("63019", 2, 3.0, 183),
        ("63014", 3, 3.0, 184), ("63015", 3, 3.0, 184), ("FINAL_PROJECT_1", 3, 3.0, 184),
        ("63103", 4, 3.0, 184), ("63110", 4, 3.0, 184), ("FINAL_PROJECT_2", 4, 3.0, 184),
    ],
    "msc-industrial-engineering-2026": [
        ("53111", 1, 3.0, 187), ("53112", 1, 3.0, 187), ("53215", 1, 2.0, 187), ("53216", 1, 0.0, 187),
        ("53115", 2, 2.0, 187), ("53222", 2, 2.0, 187), ("53217", 2, 0.0, 187),
        ("53110", 3, 3.0, 187), ("53218", 3, 0.0, 187),
        ("FINAL_PROJECT_2", 4, 3.0, 187), ("53219", 4, 0.0, 187),
    ],
}

# Rows without a single fixed semester (completion requirements and course
# catalogs) are still checked for exact course identifiers. The source has no
# identifier for the two industrial-engineering elective slots, so none is
# invented for the planner.
MASTER_PROGRAM_EXPECTED_IDS = {
    "msc-biotechnology-2026": {
        "43101", "43104", "43405", "43501", "43208", "43103", "43113", "43209", "43114", "43105",
        "43203", "43201", "43202", "43206", "41010", "41020", "41050", "41060", "51701", "41041",
        "11136", "41225", "41113", "41150", "41161", "41162", "41305", "41335", "41180", "51728", "51605", "11058",
    },
    "msc-systems-engineering-2026": {
        "53323", "53311", "53312", "53314", "53429", "53322", "53313", "53324", "53344", "53428", "53422", "53333", "53342", "53334",
        "53526", "53413", "53417", "53427", "53425", "53231", "53243", "53423", "LVL_PROB", "LVL_ECON", "LVL_CONTROL", "LVL_QA",
    },
    "msc-software-engineering-2026": {
        "63010", "63011", "63012", "63019", "63014", "63015", "FINAL_PROJECT_1", "63103", "63110", "FINAL_PROJECT_2",
        "63001", "63105", "63102", "63102-2", "63104", "63107", "63108",
    },
    "msc-industrial-engineering-2026": {
        "53111", "53112", "53215", "53216", "53115", "53222", "53217", "53110", "53218", "FINAL_PROJECT_2", "53219",
        "51131", "51132", "51702", "51728", "51605", "51618", "51617", "51429", "51430", "51213", "51215", "51141", "51723", "51724", "51432", "51431", "51136",
    },
}

# Teaching/general studies is a catalog rather than a semester map. Its active
# edition is nevertheless checked against every explicit course row (pp.
# 161-169), including the prerequisite relations printed in the teaching
# certificate tables.
TEACHING_CATALOG_ROWS = [
    ("81280", 2.0, 166), ("81281", 2.0, 161), ("81282", 2.0, 161), ("81283", 2.0, 161), ("81284", 2.0, 161),
    ("81285", 2.0, 161), ("81287", 3.0, 161), ("81288", 2.0, 161), ("81289", 2.0, 161), ("81291", 3.0, 161),
    ("81293", 3.0, 163), ("81294", 3.0, 161), ("81295", 3.0, 163), ("81296", 3.0, 163), ("81297", 2.0, 162),
    ("81298", 3.0, 162), ("81320", 3.0, 162), ("81355", 2.0, 166), ("81360", 0.0, 161), ("81373", 0.0, 161),
    ("81380", 3.0, 162), ("81383", 6.0, 162), ("81387", 6.0, 162), ("81399", 3.0, 166), ("81403", 10.0, 164),
    ("81404", 10.0, 164), ("81410", 2.0, 164), ("81411", 2.0, 164), ("81419", 0.0, 161), ("81430", 6.0, 166),
    ("81431", 6.0, 166), ("81556", 2.0, 164), ("81561", 3.0, 164), ("81578", 2.0, 166), ("81671", 2.0, 162),
    ("85381", 2.0, 166), ("85390", 2.0, 166),
    ("11281", 2.0, 167), ("11282", 2.0, 167), ("11283", 2.0, 167), ("11284", 2.0, 167), ("11337", 2.0, 167),
    ("11347", 2.0, 167), ("11348", 2.0, 167), ("11352", 2.0, 167), ("11354", 2.0, 167), ("11375", 2.0, 167),
    ("11386", 2.0, 167), ("11499", 2.0, 167), ("11565", 2.0, 167), ("11568", 2.0, 167), ("11569", 2.0, 167),
    ("11575", 2.0, 167), ("11578", 2.0, 167), ("11871", 2.0, 168), ("11874", 2.0, 168),
    ("11073", 1.0, 169), ("11091", 1.0, 169), ("11092", 1.0, 169), ("11431", 1.0, 169), ("11432", 1.0, 169), ("11490", 0.0, 169),
]

TEACHING_CATALOG_DEPENDENCIES = {
    "81287": {"81288"}, "81288": {"81287"}, "81285": {"81287"},
    "81289": {"81287", "81285", "81288"}, "81294": {"81287", "81288"},
    "81295": {"81287", "81288"}, "81296": {"81287", "81288"}, "81297": {"81287"},
    "81320": {"81287", "81285", "81288"}, "81380": {"81287", "81285", "81288"},
    "81383": {"81287", "81285", "81288", "81380"}, "81387": {"81383"},
    "81403": {"81287", "81285", "81288", "81380", "81295", "81296"}, "81404": {"81403"},
    "81430": {"81399", "81285", "81380"}, "81431": {"81430"},
}

# Numeric references used only to describe an exemption/screening condition are
# not degree courses. These are deliberately scoped to the exact course row:
# 11179 is a real prerequisite in other programs.
EXTERNAL_REFERENCE_IDS_BY_COURSE = {
    ("braude-software-2026", "61181"): {"11179", "11279", "12179"},
    ("information-systems-engineering-2026", "61181"): {"12179"},
    ("industrial-engineering-bsc-2026", "11209"): {"12179"},
}

# Official footnote 1 on p. 122 states that the strict prerequisites of 61756
# also apply to its two simultaneous courses. The table repeats only the
# co-requisite links for those rows, so the effective dependencies are explicit
# here rather than guessed from visual proximity.
DEPENDENCY_SUPPLEMENTS = {
    ("braude-software-2026", "61757"): {"11060", "61751", "61755"},
    ("braude-software-2026", "61769"): {"11060", "61751", "61755"},
    ("electrical-engineering-2026", "31103"): {"31100", "31101"},
    ("electrical-engineering-2026", "31104"): {"31100", "31101"},
    ("information-systems-engineering-2026", "61757"): {"11060", "61751", "61755"},
    ("information-systems-engineering-2026", "61769"): {"11060", "61751", "61755"},
}

# In the electrical table, the final digit of 31705 is emitted as a separate
# PDF word. The rendered source row clearly reads 31705 (p. 83).
SOURCE_DEPENDENCY_CORRECTIONS = {
    ("electrical-engineering-2026", "31999", "3170"): "31705",
}

# Mechanical engineering pages 96-98 contain multi-line prerequisite cells.
# These values were read from the rendered official rows, because text-flow
# extraction sometimes assigns a line to the adjacent row in this table.
SOURCE_DEPENDENCY_OVERRIDES = {
    ("mechanical-engineering-bsc-2026", "11005"): {"11003"},
    ("mechanical-engineering-bsc-2026", "11133"): {"11001", "11005"},
    ("mechanical-engineering-bsc-2026", "11212"): {"11001", "11005", "22511"},
    ("mechanical-engineering-bsc-2026", "22210"): {"22112", "22205", "22400"},
    ("mechanical-engineering-bsc-2026", "22511"): {"11001", "11005", "11179", "22305"},
    ("mechanical-engineering-bsc-2026", "22512"): {"11005", "22305", "22511"},
    ("mechanical-engineering-bsc-2026", "22520"): {"11133", "22310", "22512"},
    ("mechanical-engineering-bsc-2026", "22600"): {"11133"},
    ("mechanical-engineering-bsc-2026", "22705"): set(),
    ("mechanical-engineering-bsc-2026", "22715"): {"22205", "22310", "22400"},
}

# Footnote 1 on p. 112 explicitly changes 11121 to 2.5 credits in the 2025-26
# edition even though the table's numeric column still shows the old value.
CREDIT_OVERRIDES = {
    ("applied-mathematics-2026", "11121"): 2.5,
}


@dataclass(frozen=True)
class SourceCourse:
    course_id: str
    semester: int
    page: int
    top: float
    credits: float | None
    prerequisite_ids: tuple[str, ...]
    corequisite_candidates: tuple[str, ...]


def numeric_word(text: str) -> str | None:
    value = text.replace(" ", "").strip()
    return value if COURSE_CODE.fullmatch(value) else None


def semester_headers(words: list[dict[str, Any]]) -> list[tuple[float, int]]:
    headers: list[tuple[float, int]] = []

    for word in words:
        # PDF text is in visual RTL order, therefore "semester" is emitted as
        # "רטסמס" and its number appears immediately to the left.
        # Actual table headings are in the far-right semester column. Narrative
        # footnotes can contain the same word farther left and must not reset a
        # carried semester on the next page.
        if word["text"] != "רטסמס" or word["x0"] < 450:
            continue

        candidates = [
            item
            for item in words
            if abs(item["top"] - word["top"]) <= 2
            and item["x1"] < word["x0"]
            and re.fullmatch(r"\*?[1-8]\*?", item["text"].strip())
        ]
        if not candidates:
            continue

        semester = int(re.search(r"[1-8]", candidates[-1]["text"]).group(0))
        if 1 <= semester <= 8:
            headers.append((float(word["top"]), semester))

    return sorted(set(headers))


def is_underline_for_line(rectangles: Iterable[dict[str, Any]], top: float, bottom: float) -> bool:
    """Detect the yearbook's underline that marks a corequisite line.

    Table borders span the entire row. Underlines are short, thin rectangles in
    the prerequisite column, placed at the baseline of one prerequisite line.
    """

    for rectangle in rectangles:
        if rectangle["height"] > 1.1 or rectangle["width"] < 12 or rectangle["width"] > 165:
            continue
        if rectangle["x0"] >= 280:
            continue
        if top - 1.5 <= rectangle["top"] <= bottom + 2.5:
            return True
    return False


def table_row_boundaries(rectangles: Iterable[dict[str, Any]]) -> list[float]:
    """Return the y coordinates of full-width horizontal table boundaries."""

    by_top: dict[float, list[dict[str, Any]]] = defaultdict(list)
    for rectangle in rectangles:
        if rectangle["height"] <= 1.1:
            by_top[round(float(rectangle["top"]), 1)].append(rectangle)

    boundaries = []
    for top, row_rectangles in by_top.items():
        minimum_x = min(float(rectangle["x0"]) for rectangle in row_rectangles)
        maximum_x = max(float(rectangle["x1"]) for rectangle in row_rectangles)
        # Row borders are emitted as several adjacent cell rectangles spanning
        # the whole table. A corequisite underline is much shorter.
        if minimum_x <= 130 and maximum_x >= 475:
            boundaries.append(top)

    return sorted(set(boundaries))


def source_courses_for_page(
    page: pdfplumber.page.Page,
    page_number: int,
    carried_semester: int | None = None,
    max_top: float | None = None,
) -> tuple[list[SourceCourse], int | None]:
    words = page.extract_words(x_tolerance=1, y_tolerance=1, use_text_flow=True)
    if max_top is not None:
        words = [word for word in words if float(word["top"]) < max_top]
    headers = semester_headers(words)
    if not headers and carried_semester is None:
        return [], None

    primary_rows = []
    for word in words:
        course_id = numeric_word(word["text"])
        # Fixed curriculum table course codes appear in the rightmost column.
        # References in the prerequisite column are left of x=280.
        if course_id and word["x0"] >= 450:
            primary_rows.append((float(word["top"]), course_id, word))

    if not primary_rows:
        return [], headers[-1][1] if headers else carried_semester

    primary_rows.sort(key=lambda row: row[0])
    result: list[SourceCourse] = []
    rectangles = page.rects

    sections = headers[:]
    if not sections and carried_semester is not None:
        sections = [(-25.0, carried_semester)]
    elif carried_semester is not None and headers[0][0] > 40:
        # A table can continue from the previous page before the next printed
        # semester header appears. Keep the predecessor as a first section.
        sections.insert(0, (-25.0, carried_semester))

    row_boundaries = table_row_boundaries(page.rects)

    for header_index, (header_top, semester) in enumerate(sections):
        next_header_top = sections[header_index + 1][0] if header_index + 1 < len(sections) else float("inf")
        rows = [
            row
            for row in primary_rows
            # Leave a header-sized gap before the first course row.
            if header_top + 25 <= row[0] < next_header_top - 2
        ]

        for index, (row_top, course_id, code_word) in enumerate(rows):
            row_start_candidates = [boundary for boundary in row_boundaries if boundary <= row_top]
            row_end_candidates = [boundary for boundary in row_boundaries if boundary > float(code_word["bottom"])]
            # Every official curriculum table has row borders. The fallback is
            # only retained for a malformed PDF page, and is marked by the
            # report's source coordinates for subsequent visual review.
            previous_top = row_start_candidates[-1] if row_start_candidates else header_top + 25
            next_top = row_end_candidates[0] if row_end_candidates else (
                next_header_top if index == len(rows) - 1 else rows[index + 1][0] + 3
            )
            local_words = [
                word
                for word in words
                if previous_top <= float(word["top"]) < next_top and word["x0"] < 280
            ]

            prerequisite_ids: list[str] = []
            corequisite_candidates: list[str] = []
            by_line: dict[float, list[dict[str, Any]]] = defaultdict(list)
            for word in local_words:
                by_line[round(float(word["top"]), 1)].append(word)

            for line_words in by_line.values():
                line_codes = [numeric_word(word["text"]) for word in line_words]
                line_codes = [code for code in line_codes if code]
                if not line_codes:
                    continue
                line_top = min(float(word["top"]) for word in line_words)
                line_bottom = max(float(word["bottom"]) for word in line_words)
                underlined = is_underline_for_line(rectangles, line_top, line_bottom)
                for code in line_codes:
                    if code == course_id:
                        continue
                    prerequisite_ids.append(code)
                    if underlined:
                        corequisite_candidates.append(code)

            header_credit_words = [
                word
                for word in words
                if word["text"] == 'ז"נ' and header_top < float(word["top"]) <= header_top + 35
            ]
            credit_column_x = header_credit_words[0]["x0"] if header_credit_words else None
            credit_candidates = [
                word["text"]
                for word in words
                if credit_column_x is not None
                and abs(float(word["x0"]) - float(credit_column_x)) <= 12
                and abs(float(word["top"]) - row_top) <= 2
            ]
            credits = None
            for value in credit_candidates:
                try:
                    credits = float(value.replace(",", "."))
                    break
                except ValueError:
                    continue

            result.append(
                SourceCourse(
                    course_id=course_id,
                    semester=semester,
                    page=page_number,
                    top=row_top,
                    credits=credits,
                    prerequisite_ids=tuple(sorted(set(prerequisite_ids))),
                    corequisite_candidates=tuple(sorted(set(corequisite_candidates))),
                )
            )

    return result, sections[-1][1] if sections else carried_semester


def load_plan_courses(connection: sqlite3.Connection, program_id: str) -> dict[str, dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT id, name, credits, semester
        FROM courses
        WHERE program_id = ?
        """,
        (program_id,),
    ).fetchall()
    courses = {
        str(row["id"]): {
            "id": str(row["id"]),
            "name": str(row["name"]),
            "credits": float(row["credits"]),
            "semester": row["semester"],
            "prerequisites": set(),
            "corequisites": set(),
        }
        for row in rows
    }

    prerequisite_rows = connection.execute(
        """
        SELECT groups.course_id, items.prerequisite_course_id
        FROM course_prerequisite_groups AS groups
        JOIN course_prerequisite_items AS items ON items.group_id = groups.id
        WHERE groups.program_id = ?
        """,
        (program_id,),
    ).fetchall()
    for row in prerequisite_rows:
        course = courses.get(str(row["course_id"]))
        if course:
            course["prerequisites"].add(str(row["prerequisite_course_id"]))

    corequisite_rows = connection.execute(
        """
        SELECT course_id, corequisite_course_id
        FROM course_corequisites
        WHERE program_id = ?
        """,
        (program_id,),
    ).fetchall()
    for row in corequisite_rows:
        course = courses.get(str(row["course_id"]))
        if course:
            course["corequisites"].add(str(row["corequisite_course_id"]))

    return courses


def audit_program(connection: sqlite3.Connection, pdf: pdfplumber.PDF, program_id: str, page_range: tuple[int, int]) -> dict[str, Any]:
    sources: list[SourceCourse] = []
    carried_semester: int | None = None
    for page_number in range(page_range[0], page_range[1] + 1):
        page_max_top = PAGE_TOP_LIMITS.get((program_id, page_number))
        page_sources, carried_semester = source_courses_for_page(
            pdf.pages[page_number - 1],
            page_number,
            carried_semester=PAGE_INITIAL_SEMESTERS.get((program_id, page_number), carried_semester),
            max_top=page_max_top,
        )
        sources.extend(page_sources)

    # Alternative courses can intentionally occur twice in one source semester.
    source_by_id: dict[str, SourceCourse] = {}
    duplicate_source_rows: dict[str, list[SourceCourse]] = defaultdict(list)
    for source in sources:
        duplicate_source_rows[source.course_id].append(source)
        source_by_id.setdefault(source.course_id, source)

    plan_courses = load_plan_courses(connection, program_id)
    missing = []
    semester_mismatches = []
    credit_mismatches = []
    prerequisite_mismatches = []

    for course_id, source in sorted(source_by_id.items()):
        plan_course = plan_courses.get(course_id)
        if not plan_course:
            missing.append(asdict(source))
            continue

        if plan_course["semester"] != source.semester:
            semester_mismatches.append(
                {
                    "courseId": course_id,
                    "expectedSemester": source.semester,
                    "actualSemester": plan_course["semester"],
                    "page": source.page,
                }
            )
        expected_credits = CREDIT_OVERRIDES.get((program_id, course_id), source.credits)
        if expected_credits is not None and abs(plan_course["credits"] - expected_credits) > 0.001:
            credit_mismatches.append(
                {
                    "courseId": course_id,
                    "expectedCredits": expected_credits,
                    "actualCredits": plan_course["credits"],
                    "page": source.page,
                }
            )

        source_dependencies = set(source.prerequisite_ids) - EXTERNAL_REFERENCE_IDS_BY_COURSE.get(
            (program_id, course_id), set()
        )
        source_dependencies = {
            SOURCE_DEPENDENCY_CORRECTIONS.get((program_id, course_id, dependency), dependency)
            for dependency in source_dependencies
        }
        source_dependencies.update(DEPENDENCY_SUPPLEMENTS.get((program_id, course_id), set()))
        source_dependencies = SOURCE_DEPENDENCY_OVERRIDES.get(
            (program_id, course_id), source_dependencies
        )
        plan_dependencies = {
            dependency
            for dependency in plan_course["prerequisites"] | plan_course["corequisites"]
            if COURSE_CODE.fullmatch(dependency)
        }
        if source_dependencies and source_dependencies != plan_dependencies:
            prerequisite_mismatches.append(
                {
                    "courseId": course_id,
                    "sourceDependencies": sorted(source_dependencies),
                    "actualDependencies": sorted(plan_dependencies),
                    "sourceCorequisiteCandidates": list(source.corequisite_candidates),
                    "page": source.page,
                    "extraction": "review required: underline marks corequisites in the official PDF",
                }
            )

    source_ids = set(source_by_id)
    return {
        "sourcePages": list(range(page_range[0], page_range[1] + 1)),
        "sourceCourseRows": len(sources),
        "distinctSourceCourseIds": len(source_by_id),
        "duplicateSourceRows": {
            course_id: [asdict(source) for source in rows]
            for course_id, rows in sorted(duplicate_source_rows.items())
            if len(rows) > 1
        },
        "missingFromPlan": missing,
        "unverifiedPlanSemesterCourses": [
            {
                "courseId": course_id,
                "name": course["name"],
                "semester": course["semester"],
            }
            for course_id, course in sorted(plan_courses.items())
            if isinstance(course["semester"], int)
            and course_id not in source_ids
            and COURSE_CODE.fullmatch(course_id)
        ],
        "semesterMismatches": semester_mismatches,
        "creditMismatches": credit_mismatches,
        "prerequisiteMismatches": prerequisite_mismatches,
    }


def audit_master_program(
    connection: sqlite3.Connection,
    program_id: str,
    source_rows: list[tuple[str, int, float | None, int]],
    expected_course_ids: set[str],
) -> dict[str, Any]:
    """Audit an explicitly reviewed Master's schedule and course catalog."""

    plan_courses = load_plan_courses(connection, program_id)
    missing = []
    semester_mismatches = []
    credit_mismatches = []

    for course_id, semester, credits, page in source_rows:
        plan_course = plan_courses.get(course_id)
        if not plan_course:
            missing.append(
                {
                    "courseId": course_id,
                    "expectedSemester": semester,
                    "expectedCredits": credits,
                    "page": page,
                }
            )
            continue
        if plan_course["semester"] != semester:
            semester_mismatches.append(
                {
                    "courseId": course_id,
                    "expectedSemester": semester,
                    "actualSemester": plan_course["semester"],
                    "page": page,
                }
            )
        if credits is not None and abs(plan_course["credits"] - credits) > 0.001:
            credit_mismatches.append(
                {
                    "courseId": course_id,
                    "expectedCredits": credits,
                    "actualCredits": plan_course["credits"],
                    "page": page,
                }
            )

    unexpected = [
        {"courseId": course_id, "name": course["name"], "semester": course["semester"]}
        for course_id, course in sorted(plan_courses.items())
        if course_id not in expected_course_ids
    ]

    return {
        "sourcePages": sorted({page for _, _, _, page in source_rows}),
        "sourceCourseRows": len(source_rows),
        "distinctSourceCourseIds": len({course_id for course_id, _, _, _ in source_rows}),
        "missingFromPlan": missing,
        "unverifiedPlanSemesterCourses": [],
        "semesterMismatches": semester_mismatches,
        "creditMismatches": credit_mismatches,
        "prerequisiteMismatches": [],
        "unexpectedPlanCourses": unexpected,
    }


def audit_catalog_program(connection: sqlite3.Connection) -> dict[str, Any]:
    program_id = "teaching-general-studies-2026"
    plan_courses = load_plan_courses(connection, program_id)
    expected_ids = {course_id for course_id, _, _ in TEACHING_CATALOG_ROWS}
    missing = []
    credit_mismatches = []
    prerequisite_mismatches = []

    for course_id, credits, page in TEACHING_CATALOG_ROWS:
        course = plan_courses.get(course_id)
        if not course:
            missing.append({"courseId": course_id, "expectedCredits": credits, "page": page})
            continue
        if abs(course["credits"] - credits) > 0.001:
            credit_mismatches.append(
                {
                    "courseId": course_id,
                    "expectedCredits": credits,
                    "actualCredits": course["credits"],
                    "page": page,
                }
            )

    for course_id, expected_dependencies in TEACHING_CATALOG_DEPENDENCIES.items():
        course = plan_courses.get(course_id)
        if not course:
            continue
        actual_dependencies = {
            dependency
            for dependency in course["prerequisites"] | course["corequisites"]
            if COURSE_CODE.fullmatch(dependency)
        }
        if actual_dependencies != expected_dependencies:
            prerequisite_mismatches.append(
                {
                    "courseId": course_id,
                    "sourceDependencies": sorted(expected_dependencies),
                    "actualDependencies": sorted(actual_dependencies),
                    "page": next(page for row_id, _, page in TEACHING_CATALOG_ROWS if row_id == course_id),
                }
            )

    return {
        "sourcePages": list(range(161, 170)),
        "sourceCourseRows": len(TEACHING_CATALOG_ROWS),
        "distinctSourceCourseIds": len(expected_ids),
        "catalogProgram": True,
        "missingFromPlan": missing,
        "unverifiedPlanSemesterCourses": [],
        "semesterMismatches": [],
        "creditMismatches": credit_mismatches,
        "prerequisiteMismatches": prerequisite_mismatches,
        "unexpectedPlanCourses": [
            {"courseId": course_id, "name": course["name"]}
            for course_id, course in sorted(plan_courses.items())
            if course_id not in expected_ids
        ],
    }


def mismatch_count(program_report: dict[str, Any]) -> int:
    return sum(
        len(program_report.get(key, []))
        for key in (
            "missingFromPlan",
            "semesterMismatches",
            "creditMismatches",
            "prerequisiteMismatches",
            "unexpectedPlanCourses",
        )
    )


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, default=Path(r"C:\Users\Dorit\Downloads\shnaton_2026_toweb-1.pdf"))
    parser.add_argument("--database", type=Path, default=root / "data" / "degree-planner.sqlite")
    parser.add_argument("--report", type=Path, default=root / "data" / "yearbook" / "2026-curriculum-audit.json")
    parser.add_argument("--fail-on-mismatch", action="store_true")
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise SystemExit(f"Official yearbook PDF not found: {args.pdf}")
    if not args.database.is_file():
        raise SystemExit(f"Database not found: {args.database}; run npm run db:seed first.")

    connection = sqlite3.connect(args.database)
    connection.row_factory = sqlite3.Row
    with pdfplumber.open(args.pdf) as pdf:
        bsc_programs = {
            program_id: audit_program(connection, pdf, program_id, page_range)
            for program_id, page_range in BSC_PROGRAM_TABLES.items()
        }
    master_programs = {
        program_id: audit_master_program(
            connection,
            program_id,
            source_rows,
            MASTER_PROGRAM_EXPECTED_IDS[program_id],
        )
        for program_id, source_rows in MASTER_PROGRAM_ROWS.items()
    }
    catalog_programs = {"teaching-general-studies-2026": audit_catalog_program(connection)}
    connection.close()

    programs = {**bsc_programs, **master_programs, **catalog_programs}

    summary = {
        "auditedPrograms": len(programs),
        "bscTablePrograms": len(bsc_programs),
        "masterPrograms": len(master_programs),
        "catalogPrograms": len(catalog_programs),
        "manualReviewPrograms": len(MANUAL_REVIEW_PROGRAMS),
        "mismatches": sum(mismatch_count(report) for report in programs.values()),
    }
    payload = {
        "catalogYear": 'תשפ"ו (2025-2026)',
        "source": args.pdf.name,
        "summary": summary,
        "programs": programs,
        "manualReviewPrograms": MANUAL_REVIEW_PROGRAMS,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"2026 yearbook audit: {summary['auditedPrograms']} table programs, "
        f"{summary['mismatches']} mismatches, "
        f"{summary['manualReviewPrograms']} manual-layout programs."
    )
    print(f"Report: {args.report}")
    if args.fail_on_mismatch and summary["mismatches"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
