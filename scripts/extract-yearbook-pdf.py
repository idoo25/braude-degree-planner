#!/usr/bin/env python3
"""Extract structured course tables from the Braude yearbook PDF.

The source PDF stores its Hebrew table cells in visual order. pdfplumber still
preserves the table structure, so we reverse only human-readable cells while
keeping numeric course codes and workload columns untouched.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import pdfplumber


YEARBOOK_2026_RANGES = {
    "civil-engineering": (56, 68),
    "biotechnology-engineering": (69, 78),
    "electrical-engineering": (79, 93),
    "mechanical-engineering-bsc": (94, 109),
    "applied-mathematics": (109, 117),
    "braude-software-2020": (118, 127),
    "information-systems-engineering": (128, 137),
    "industrial-engineering-bsc": (138, 157),
    "teaching-general-studies": (158, 171),
    "msc-biotechnology": (172, 176),
    "msc-systems-engineering": (177, 181),
    "msc-software-engineering": (182, 184),
    "msc-industrial-engineering": (185, 189),
}

COURSE_CODE = re.compile(r"^\d{4,7}$")
NUMBER = re.compile(r"^-?\d+(?:\.\d+)?$")


def reverse_visual_text(value: str | None) -> str:
    if not value:
        return ""

    return "\n".join(line[::-1].strip() for line in value.splitlines()).strip()


def normalize_course_name(value: str | None) -> str:
    # A table footnote marker is visually attached to the beginning of a cell.
    raw = (value or "").strip()
    raw = re.sub(r"^\d+(?=[^\d\s])", "", raw)
    return reverse_visual_text(raw)


def normalize_number(value: str | None) -> float | None:
    if not value:
        return None

    normalized = value.strip().replace(",", ".")
    return float(normalized) if NUMBER.fullmatch(normalized) else None


def course_row(row: list[str | None]) -> dict[str, Any] | None:
    if len(row) not in (7, 8):
        return None

    raw_code = (row[-1] or "").strip()
    if not COURSE_CODE.fullmatch(raw_code):
        return None

    credits = normalize_number(row[1])
    if credits is None:
        return None

    has_project_column = len(row) == 8
    requirements_index = 0
    credits_index = 1
    project_index = 2 if has_project_column else None
    lab_index = 3 if has_project_column else 2
    tutorial_index = 4 if has_project_column else 3
    lecture_index = 5 if has_project_column else 4

    return {
        "id": raw_code,
        "name": normalize_course_name(row[-2]),
        "credits": credits,
        "hours": {
            "lecture": normalize_number(row[lecture_index]),
            "tutorial": normalize_number(row[tutorial_index]),
            "lab": normalize_number(row[lab_index]),
            "project": normalize_number(row[project_index]) if project_index is not None else None,
        },
        "requirements": reverse_visual_text(row[requirements_index]),
    }


def coordinate_course_rows(page: pdfplumber.page.Page) -> list[dict[str, Any]]:
    """Read borderless B.Sc. course tables from their fixed PDF columns.

    Several departments exported their table without vector grid lines. Their
    typography is nevertheless consistent: course number/name on the right,
    workload and credits in the center, and requirements on the left.
    """

    words = sorted(
        page.extract_words(x_tolerance=2, y_tolerance=2, use_text_flow=True),
        key=lambda word: (word["top"], word["x0"]),
    )
    lines: list[list[dict[str, Any]]] = []

    for word in words:
        if not lines or abs(lines[-1][0]["top"] - word["top"]) > 2:
            lines.append([word])
        else:
            lines[-1].append(word)

    courses: list[dict[str, Any]] = []
    for line in lines:
        code_word = next(
            (
                word
                for word in line
                if word["x0"] >= 460
                and (match := re.search(r"(\d{4,7})", word["text"]))
            ),
            None,
        )
        if not code_word:
            continue

        code_match = re.search(r"(\d{4,7})", code_word["text"])
        if not code_match:
            continue

        nearby_words = [word for word in words if abs(word["top"] - code_word["top"]) <= 9]
        name_words = sorted(
            (
                word
                for word in nearby_words
                if 350 <= word["x0"] < code_word["x0"] - 2
            ),
            key=lambda word: (word["top"], word["x0"]),
        )
        raw_name = " ".join(word["text"] for word in name_words)
        name = normalize_course_name(raw_name)
        if not name or not re.search(r"[A-Za-z\u0590-\u05FF]", name):
            continue

        def column_number(lower: float, upper: float) -> float | None:
            values = [word["text"] for word in line if lower <= word["x0"] < upper]
            for value in values:
                number = normalize_number(value)
                if number is not None:
                    return number
            return 0 if "-" in values else None

        courses.append(
            {
                "id": code_match.group(1),
                "name": name,
                "credits": column_number(235, 265) or 0,
                "hours": {
                    "lecture": column_number(335, 350),
                    "tutorial": column_number(312, 330),
                    "lab": column_number(288, 307),
                    "project": column_number(265, 285),
                },
                "requirements": reverse_visual_text(
                    " ".join(
                        word["text"] for word in sorted(line, key=lambda word: word["x0"]) if word["x0"] < 238
                    )
                ),
                "source": "layout",
            }
        )

    return courses


def extract_program(pdf: pdfplumber.PDF, start: int, end: int) -> list[dict[str, Any]]:
    courses: dict[str, dict[str, Any]] = {}

    for page_number in range(start, end + 1):
        page = pdf.pages[page_number - 1]
        tables = page.extract_tables(
            {
                "vertical_strategy": "lines",
                "horizontal_strategy": "lines",
                "intersection_tolerance": 5,
            }
        )

        for table in tables:
            for row in table[1:]:
                course = course_row(row)
                if not course:
                    continue

                course["source"] = "grid"
                course["sourcePages"] = [page_number]
                existing = courses.get(course["id"])
                if existing:
                    existing["sourcePages"].append(page_number)
                    continue

                courses[course["id"]] = course

        for course in coordinate_course_rows(page):
            course["sourcePages"] = [page_number]
            existing = courses.get(course["id"])
            if existing:
                existing["sourcePages"].append(page_number)
                continue

            courses[course["id"]] = course

    return list(courses.values())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="Source yearbook PDF")
    parser.add_argument("--output", required=True, type=Path, help="Generated JSON destination")
    args = parser.parse_args()

    with pdfplumber.open(args.input) as pdf:
        programs = {
            program_id: {
                "sourcePages": list(page_range),
                "courses": extract_program(pdf, *page_range),
            }
            for program_id, page_range in YEARBOOK_2026_RANGES.items()
        }

    payload = {
        "catalogYear": "תשפ\"ו (2025-2026)",
        "source": args.input.name,
        "programs": programs,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
