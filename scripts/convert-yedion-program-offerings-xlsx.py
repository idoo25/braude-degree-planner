#!/usr/bin/env python3
"""Convert Yedion's program-course Excel exports into a versioned JSON source."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import openpyxl


def text(value: object) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def source_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_export(path: Path) -> dict[str, object]:
    worksheet = openpyxl.load_workbook(path, read_only=True, data_only=True).active
    rows = list(worksheet.iter_rows(min_row=3, values_only=True))
    courses = []

    for row_index, row in enumerate(rows, start=3):
        course_code = text(row[0] if len(row) > 0 else None)
        if not course_code:
            continue
        courses.append(
            {
                "rowIndex": row_index,
                "courseCode": course_code,
                "courseName": text(row[1] if len(row) > 1 else None),
                "taughtStatus": text(row[2] if len(row) > 2 else None),
                "timetableSearchText": text(row[3] if len(row) > 3 else None),
                "notes": text(row[4] if len(row) > 4 else None),
                "rawCells": [text(value) for value in row],
            }
        )

    export_id = path.stem.rsplit("_", 1)[-1]
    return {
        "exportId": export_id,
        "sourceFile": path.name,
        "sourceSha256": source_hash(path),
        "sourceModifiedAt": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        .replace(microsecond=0)
        .isoformat(),
        "sheetName": worksheet.title,
        "courses": courses,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--academic-year", required=True)
    parser.add_argument("--major-key", required=True)
    parser.add_argument("--major-name", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()

    exports = [read_export(path.resolve()) for path in args.files]
    seen_codes: set[str] = set()
    for export in exports:
        for course in export["courses"]:
            seen_codes.add(course["courseCode"])

    payload = {
        "schemaVersion": 1,
        "capturedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source": "Yedion program-course Excel exports",
        "query": {
            "academicYearValue": str(args.academic_year),
            "majorKey": args.major_key,
            "majorName": args.major_name,
        },
        "exports": exports,
        "stats": {
            "exportCount": len(exports),
            "courseRows": sum(len(export["courses"]) for export in exports),
            "uniqueCourseCodes": len(seen_codes),
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
