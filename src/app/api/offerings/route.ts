import { NextResponse } from "next/server";

import {
  FREE_TIMETABLE_PROGRAM_ID,
  getFreeTimetableOfferings,
  getProgramCourseOfferings,
} from "@/lib/db/yedion-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const programId = url.searchParams.get("programId") ?? undefined;
  const semester = url.searchParams.get("semester");
  const courseIds = url.searchParams.getAll("courseId").filter(Boolean);

  try {
    return NextResponse.json(
      programId === FREE_TIMETABLE_PROGRAM_ID
        ? getFreeTimetableOfferings({ semester, courseIds })
        : getProgramCourseOfferings(programId, { semester, courseIds })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load current course offerings." },
      { status: 400 }
    );
  }
}
