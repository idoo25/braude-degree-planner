import Link from "next/link";

import { DegreePlanner } from "@/components/degree-planner";
import { getDegreePlan, getProgramList } from "@/lib/db/degree-repository";
import { createDegreeAudit } from "@/lib/degree-audit";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ programId: string }>;
};

export default async function ProgramPage({ params }: PageProps) {
  const { programId } = await params;
  const knownProgramIds = new Set(getProgramList().map((program) => program.id));

  if (!knownProgramIds.has(programId)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
        <h1 className="text-2xl font-semibold">התוכנית לא נמצאה</h1>
        <p className="text-sm text-muted-foreground">
          תוכנית הלימודים &quot;{programId}&quot; אינה קיימת במערכת.
        </p>
        <Link href="/" className="text-sm text-primary underline underline-offset-4">
          חזרה לרשימת התוכניות
        </Link>
      </div>
    );
  }

  const plan = getDegreePlan(programId);

  return <DegreePlanner initialAudit={createDegreeAudit([], plan)} plan={plan} />;
}
