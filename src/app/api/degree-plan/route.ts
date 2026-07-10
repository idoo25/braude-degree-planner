import { NextResponse } from "next/server";

import { getDegreePlan } from "@/lib/db/degree-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const programId = new URL(request.url).searchParams.get("programId") ?? undefined;

  return NextResponse.json(getDegreePlan(programId));
}
