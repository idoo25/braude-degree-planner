import type { DegreePlan } from "@/types/degree";

import { degreePlan as previousPlan } from "./msc-software-engineering";

export const degreePlan: DegreePlan = {
  ...previousPlan,
  id: "msc-software-engineering-2026",
  subtitle: "המכללה האקדמית להנדסה בראודה - שנתון תשפ\"ו (2025-2026)",
  catalogYear: 'תשפ"ו (2025-2026)',
  status: "active",
  source: { fileName: "שנתון תשפ\"ו 2025-2026", pages: "182-184", extractedAt: "2026-07-11" },
  notes: previousPlan.notes.map((note) =>
    note.replaceAll('שנתון תשפ"ד', 'שנתון תשפ"ו').replaceAll("2023-2024", "2025-2026")
  ),
};
