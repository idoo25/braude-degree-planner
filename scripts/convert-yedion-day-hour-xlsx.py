#!/usr/bin/env python3
"""Convert Yedion's day-and-hour Excel export into the search-import JSON format."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import openpyxl


def text(value: object) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def semester_search_value(semester: str | None) -> str:
    return {"א": "1", "ב": "2", "קיץ": "3"}.get(semester or "", "1")


def semester_search_text(value: str) -> str:
    return {"1": "סמסטר א", "2": "סמסטר ב", "3": "סמסטר קיץ"}.get(value, "סמסטר א")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--academic-year", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    input_path = args.input.resolve()
    worksheet = openpyxl.load_workbook(input_path, read_only=True, data_only=True).active
    rows = []
    semesters: dict[str, int] = {}

    for row_index, row in enumerate(worksheet.iter_rows(min_row=3, values_only=True), start=0):
        course_code = text(row[0] if len(row) > 0 else None)
        if not course_code:
            continue
        semester = text(row[3] if len(row) > 3 else None)
        search_value = semester_search_value(semester)
        raw_cells = [
            f"קוד קורס: {course_code}",
            f"שם קורס: {text(row[1] if len(row) > 1 else None) or ''}",
            f"סוג קורס: {text(row[2] if len(row) > 2 else None) or ''}",
            f"סמסטר: {semester or ''}",
            f"יום בשבוע: {text(row[4] if len(row) > 4 else None) or ''}",
            f"שעת התחלה: {text(row[5] if len(row) > 5 else None) or ''}",
            f"שעת סיום: {text(row[6] if len(row) > 6 else None) or ''}",
            f"מרצה: {text(row[7] if len(row) > 7 else None) or ''}",
            f"פרטים נוספים: {text(row[8] if len(row) > 8 else None) or ''}",
        ]
        rows.append(
            {
                "courseCode": course_code,
                "courseName": text(row[1] if len(row) > 1 else None),
                "subjectType": text(row[2] if len(row) > 2 else None),
                "semester": semester,
                "dayOfWeek": text(row[4] if len(row) > 4 else None),
                "startTime": text(row[5] if len(row) > 5 else None),
                "endTime": text(row[6] if len(row) > 6 else None),
                "lecturerName": text(row[7] if len(row) > 7 else None),
                "detailsText": text(row[8] if len(row) > 8 else None),
                "group": None,
                "room": None,
                "rowIndex": row_index,
                "searchSemesterValue": search_value,
                "searchSemesterText": semester_search_text(search_value),
                "rawCells": raw_cells,
                "rawText": " ".join(raw_cells),
            }
        )
        semesters[semester or "ללא סמסטר"] = semesters.get(semester or "ללא סמסטר", 0) + 1

    search_semesters = [
        {"value": value, "text": semester_search_text(value)}
        for semester in ("א", "ב", "קיץ")
        if semesters.get(semester)
        for value in [semester_search_value(semester)]
    ]

    payload = {
        "capturedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source": "Yedion day-and-hour Excel export",
        "query": {
            "academicYearValue": str(args.academic_year),
            "semesters": search_semesters,
            "dayValue": "7",
            "dayText": "כל הימים והשעות",
            "hourValue": "1",
            "hourText": "08:30-09:30",
            "note": "Imported from Yedion Excel export. The export omits group and room fields.",
        },
        "sourceFile": input_path.name,
        "sheetName": worksheet.title,
        "rows": rows,
        "stats": {
            "totalRows": len(rows),
            "semesterRows": semesters,
            "uniqueCourseCodes": len({row["courseCode"] for row in rows}),
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
