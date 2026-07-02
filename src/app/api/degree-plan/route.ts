import { NextResponse } from "next/server";

import { getDegreePlan } from "@/lib/db/degree-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getDegreePlan());
}
