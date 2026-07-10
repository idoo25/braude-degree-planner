import { NextResponse } from "next/server";

import { getDegreePlan } from "@/lib/db/degree-repository";
import { createDegreeAudit } from "@/lib/degree-audit";

type AuditRequest = {
  selectedCourseIds?: unknown;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as AuditRequest;
  const selectedCourseIds = Array.isArray(body.selectedCourseIds)
    ? body.selectedCourseIds.filter((id): id is string => typeof id === "string")
    : [];
  const programId = new URL(request.url).searchParams.get("programId") ?? undefined;

  return NextResponse.json(createDegreeAudit(selectedCourseIds, getDegreePlan(programId)));
}
