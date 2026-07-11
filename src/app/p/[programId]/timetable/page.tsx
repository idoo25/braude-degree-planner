import Link from "next/link";

import { TimetableBuilder } from "@/components/timetable-builder";
import { getDegreePlan, getProgramList } from "@/lib/db/degree-repository";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ programId: string }>;
};

export default async function TimetablePage({ params }: PageProps) {
  const { programId } = await params;
  const programs = getProgramList();
  const knownProgramIds = new Set(programs.map((program) => program.id));

  if (!knownProgramIds.has(programId)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">התוכנית לא נמצאה</h1>
        <Link href="/" className="text-sm text-primary underline underline-offset-4">
          חזרה לרשימת התוכניות
        </Link>
      </main>
    );
  }

  return <TimetableBuilder plan={getDegreePlan(programId)} programs={programs} />;
}
