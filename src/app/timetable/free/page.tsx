import { TimetableBuilder } from "@/components/timetable-builder";
import { getProgramList } from "@/lib/db/degree-repository";
import { getFreeTimetablePlan } from "@/lib/db/yedion-repository";

export const dynamic = "force-dynamic";

export default function FreeTimetablePage() {
  return <TimetableBuilder plan={getFreeTimetablePlan()} freeMode programs={getProgramList()} />;
}
