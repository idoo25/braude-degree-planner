import { DegreePlanner } from "@/components/degree-planner";
import { getDegreePlan } from "@/lib/db/degree-repository";
import { createDegreeAudit } from "@/lib/degree-audit";

export const dynamic = "force-dynamic";

export default function Home() {
  const plan = getDegreePlan();

  return <DegreePlanner initialAudit={createDegreeAudit([], plan)} plan={plan} />;
}
