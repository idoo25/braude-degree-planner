"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  Filter,
  GraduationCap,
  LockKeyhole,
  RotateCcw,
  Search,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Course, CourseAudit, DegreeAudit, DegreePlan } from "@/types/degree";

const STORAGE_NAMESPACE = "degree-planner:selected";

type PlannerProps = {
  plan: DegreePlan;
  initialAudit: DegreeAudit;
};

function formatCredits(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function getClusterName(plan: DegreePlan, clusterId?: string) {
  return plan.clusters.find((cluster) => cluster.id === clusterId)?.name;
}

const ROMAN_NUMERALS: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function toRoman(value: number) {
  let remaining = value;
  let result = "";

  for (const [amount, symbol] of ROMAN_NUMERALS) {
    while (remaining >= amount) {
      result += symbol;
      remaining -= amount;
    }
  }

  return result;
}

function getCourseSemesterLabel(course: Course) {
  return course.semester ? `סמסטר ${toRoman(course.semester)}` : "ללא סמסטר מומלץ";
}

function createSemesterSubTabs(courses: Course[]) {
  const semesters = [...new Set(courses.flatMap((course) => (course.semester ? [course.semester] : [])))].sort(
    (a, b) => a - b
  );
  const withoutSemesterCount = courses.filter((course) => !course.semester).length;

  return [
    { value: "all", label: "כל הסמסטרים", count: courses.length },
    ...semesters.map((semester) => ({
      value: `semester:${semester}`,
      label: `סמסטר ${toRoman(semester)}`,
      count: courses.filter((course) => course.semester === semester).length,
    })),
    ...(withoutSemesterCount
      ? [{ value: "semester:none", label: "ללא סמסטר מומלץ", count: withoutSemesterCount }]
      : []),
  ];
}

function createClusterSubTabs(plan: DegreePlan, courses: Course[]) {
  const clusteredTabs = plan.clusters
    .map((cluster) => ({
      value: `cluster:${cluster.id}`,
      label: cluster.name,
      count: courses.filter((course) => course.clusterId === cluster.id).length,
    }))
    .filter((tab) => tab.count > 0);
  const withoutClusterCount = courses.filter((course) => !course.clusterId).length;

  return [
    { value: "all", label: "כל האשכולות", count: courses.length },
    ...clusteredTabs,
    ...(withoutClusterCount ? [{ value: "cluster:none", label: "ללא אשכול", count: withoutClusterCount }] : []),
  ];
}

function filterBySubTab(course: Course, subTab: string) {
  if (subTab === "all") {
    return true;
  }

  if (subTab === "semester:none") {
    return !course.semester;
  }

  if (subTab.startsWith("semester:")) {
    return course.semester === Number(subTab.replace("semester:", ""));
  }

  if (subTab === "cluster:none") {
    return !course.clusterId;
  }

  if (subTab.startsWith("cluster:")) {
    return course.clusterId === subTab.replace("cluster:", "");
  }

  return true;
}

function sortCourses(plan: DegreePlan, courses: Course[]) {
  const clusterOrder = new Map(plan.clusters.map((cluster, index) => [cluster.id, index]));

  return [...courses].sort((a, b) => {
    const semesterDiff = (a.semester ?? 99) - (b.semester ?? 99);

    if (semesterDiff !== 0) {
      return semesterDiff;
    }

    const clusterDiff =
      (clusterOrder.get(a.clusterId ?? "") ?? 99) - (clusterOrder.get(b.clusterId ?? "") ?? 99);

    if (clusterDiff !== 0) {
      return clusterDiff;
    }

    return a.id.localeCompare(b.id, "he");
  });
}

function getRuleCourseIds(value: unknown) {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function getMutuallyExclusiveCourseIds(plan: DegreePlan, courseId: string) {
  return plan.rules
    .filter((rule) => rule.enabled && rule.type === "mutual_exclusion")
    .flatMap((rule) => {
      const courseIds = getRuleCourseIds(rule.payload.courseIds);
      const maxSelected = typeof rule.payload.maxSelected === "number" ? rule.payload.maxSelected : 1;

      return maxSelected === 1 && courseIds.includes(courseId)
        ? courseIds.filter((id) => id !== courseId)
        : [];
    });
}

function normalizeSelectedCourseIds(plan: DegreePlan, courseIds: string[]) {
  return courseIds.reduce<string[]>((current, courseId) => {
    const conflictingIds = new Set(getMutuallyExclusiveCourseIds(plan, courseId));
    const withoutConflicts = current.filter((id) => !conflictingIds.has(id));

    return withoutConflicts.includes(courseId) ? withoutConflicts : [...withoutConflicts, courseId];
  }, []);
}

function useAudit(selectedCourseIds: string[], initialAudit: DegreeAudit, hydrated: boolean) {
  const [audit, setAudit] = useState<DegreeAudit>(initialAudit);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const controller = new AbortController();

    async function updateAudit() {
      setPending(true);

      try {
        const response = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedCourseIds }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Audit request failed");
        }

        setAudit((await response.json()) as DegreeAudit);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setPending(false);
        }
      }
    }

    updateAudit();

    return () => controller.abort();
  }, [selectedCourseIds, hydrated]);

  return { audit, pending };
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  progress,
  tone = "default",
}: {
  icon: typeof GraduationCap;
  label: string;
  value: string;
  detail: string;
  progress?: number;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <Card
      className={cn(
        "rounded-lg",
        tone === "success" && "ring-emerald-200",
        tone === "warning" && "ring-amber-200"
      )}
    >
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
        <CardAction>
          <Icon className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <span className="font-mono text-3xl font-semibold tracking-normal">{value}</span>
        </div>
        <p className="min-h-5 text-xs leading-5 text-muted-foreground">{detail}</p>
        {typeof progress === "number" ? <Progress value={progress} className="h-2" /> : null}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ audit }: { audit: CourseAudit }) {
  if (audit.completed) {
    return (
      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
        <CheckCircle2 /> סומן
      </Badge>
    );
  }

  if (audit.available) {
    return (
      <Badge variant="outline" className="border-emerald-200 text-emerald-700">
        <Circle /> זמין
      </Badge>
    );
  }

  return (
    <Badge variant="destructive">
      <LockKeyhole /> חסום
    </Badge>
  );
}

function CourseRow({
  audit,
  plan,
  courseTypeLabel,
  selected,
  onToggle,
}: {
  audit: CourseAudit;
  plan: DegreePlan;
  courseTypeLabel: string;
  selected: boolean;
  onToggle: (courseId: string, checked: boolean) => void;
}) {
  const { course } = audit;
  const clusterName = getClusterName(plan, course.clusterId);
  const locked = !selected && !audit.available;

  return (
    <div
      dir="rtl"
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_minmax(4.5rem,auto)] items-start gap-3 border-b px-4 py-3 text-right last:border-b-0",
        selected && "bg-emerald-50/60",
        locked && "bg-destructive/5"
      )}
    >
      <Checkbox
        checked={selected}
        disabled={locked}
        className="mt-1 size-5"
        aria-label={`סמן את ${course.name}`}
        onCheckedChange={(checked) => onToggle(course.id, checked === true)}
      />
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-start gap-2">
          <h3 className="break-words text-sm font-medium leading-6">{course.name}</h3>
          <span className="font-mono text-xs text-muted-foreground">{course.id}</span>
          <StatusBadge audit={audit} />
        </div>
        <div className="flex flex-wrap justify-start gap-1.5">
          <Badge variant="outline">{courseTypeLabel}</Badge>
          {course.semester ? <Badge variant="outline">{getCourseSemesterLabel(course)}</Badge> : null}
          {clusterName ? <Badge variant="secondary">{clusterName}</Badge> : null}
          {course.requirementGroup ? (
            <Badge variant="secondary">
              {plan.requirementGroups.find((group) => group.code === course.requirementGroup)?.name ??
                course.requirementGroup}
            </Badge>
          ) : null}
        </div>
        {course.coRequisites?.length ? (
          <p className="text-xs leading-5 text-muted-foreground">
            צמודים: {course.coRequisites.join(", ")}
          </p>
        ) : null}
        {!selected && audit.missingPrerequisites.length ? (
          <p className="text-xs leading-5 text-destructive">
            חסר: {audit.missingPrerequisites.map((item) => item.label).join("; ")}
          </p>
        ) : null}
        {course.notes?.length ? (
          <p className="text-xs leading-5 text-muted-foreground">{course.notes.join(" ")}</p>
        ) : null}
      </div>
      <div dir="ltr" className="justify-self-start whitespace-nowrap text-left font-mono text-sm font-medium">
        {formatCredits(course.credits)} {'נ"ז'}
      </div>
    </div>
  );
}

function RequirementList({ audit }: { audit: DegreeAudit }) {
  const topRemaining = audit.requiredRemaining.slice(0, 8);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">חובה שנשארה</h3>
        <Badge variant={audit.requiredRemaining.length ? "outline" : "secondary"}>
          {audit.requiredRemaining.length}
        </Badge>
      </div>
      {topRemaining.length ? (
        <div className="space-y-2">
          {topRemaining.map((gap) => (
            <div key={gap.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="leading-5">{gap.label}</span>
              {gap.credits ? (
                <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {formatCredits(gap.credits)} {'נ"ז'}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">כל קורסי החובה סומנו.</p>
      )}
    </div>
  );
}

function ClusterList({ audit }: { audit: DegreeAudit }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">אשכולות בחירה</h3>
        <Badge variant={audit.missingClusters.length ? "outline" : "secondary"}>
          {audit.clusterAudits.length - audit.missingClusters.length}/{audit.clusterAudits.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {audit.clusterAudits.map((cluster) => (
          <div key={cluster.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="leading-5">{cluster.name}</span>
              <Badge
                variant={cluster.satisfied ? "secondary" : "outline"}
                className={cluster.satisfied ? "bg-emerald-50 text-emerald-700" : undefined}
              >
                {cluster.selectedCourseIds.length}/{cluster.minCourses}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCredits(cluster.selectedCredits)} {'נ"ז'} מסומנות
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockedList({ audit }: { audit: DegreeAudit }) {
  const blocked = audit.blockedCourses.slice(0, 7);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">חסומים כרגע</h3>
        <Badge variant={audit.blockedCourses.length ? "destructive" : "secondary"}>
          {audit.blockedCourses.length}
        </Badge>
      </div>
      {blocked.length ? (
        <div className="space-y-2">
          {blocked.map((item) => (
            <div key={item.course.id} className="space-y-1 text-sm">
              <div className="font-medium leading-5">
                {item.course.id} {item.course.name}
              </div>
              <div className="text-xs leading-5 text-muted-foreground">
                {item.missingPrerequisites.map((missing) => missing.label).join("; ")}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">אין חסימות בתצוגה הנוכחית.</p>
      )}
    </div>
  );
}

export function DegreePlanner({ plan, initialAudit }: PlannerProps) {
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [activeSubTab, setActiveSubTab] = useState("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { audit, pending } = useAudit(selectedCourseIds, initialAudit, hydrated);
  const auditByCourseId = useMemo(
    () => new Map(audit.courseAudits.map((courseAudit) => [courseAudit.course.id, courseAudit])),
    [audit.courseAudits]
  );
  const storageKey = `${STORAGE_NAMESPACE}:${plan.id}:v1`;
  const courseTypeLabelByCode = useMemo(
    () => new Map(plan.courseTypes.map((type) => [type.code, type.label])),
    [plan.courseTypes]
  );
  const filterTabs = useMemo(
    () => [
      { value: "all", label: "הכל" },
      { value: "available", label: "זמין" },
      { value: "blocked", label: "חסום" },
      ...plan.courseTypes.map((type) => ({ value: `type:${type.code}`, label: type.label })),
    ],
    [plan.courseTypes]
  );

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      const saved = window.localStorage.getItem(storageKey);

      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { selectedCourseIds?: unknown };

          if (!cancelled && Array.isArray(parsed.selectedCourseIds)) {
            setSelectedCourseIds(
              normalizeSelectedCourseIds(
                plan,
                parsed.selectedCourseIds.filter((id): id is string => typeof id === "string")
              )
            );
          }
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }

      if (!cancelled) {
        setHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [plan, storageKey]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ selectedCourseIds, updatedAt: new Date().toISOString() })
    );
  }, [selectedCourseIds, hydrated, storageKey]);

  const selectedSet = useMemo(() => new Set(selectedCourseIds), [selectedCourseIds]);

  const baseCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("he");
    const filtered = plan.courses.filter((course) => {
      const courseAudit = auditByCourseId.get(course.id);
      const matchesQuery =
        !normalizedQuery ||
        `${course.id} ${course.name} ${getClusterName(plan, course.clusterId) ?? ""}`
          .toLocaleLowerCase("he")
          .includes(normalizedQuery);

      if (!matchesQuery) {
        return false;
      }

      if (activeTab === "available") {
        return courseAudit ? !courseAudit.completed && courseAudit.available : false;
      }

      if (activeTab === "blocked") {
        return courseAudit ? !courseAudit.completed && courseAudit.missingPrerequisites.length > 0 : false;
      }

      if (activeTab.startsWith("type:")) {
        return course.type === activeTab.replace("type:", "");
      }

      return true;
    });

    return sortCourses(plan, filtered);
  }, [activeTab, auditByCourseId, plan, query]);
  const subTabs = useMemo(
    () =>
      activeTab === "type:elective"
        ? createClusterSubTabs(plan, baseCourses)
        : createSemesterSubTabs(baseCourses),
    [activeTab, baseCourses, plan]
  );
  const effectiveSubTab = subTabs.some((tab) => tab.value === activeSubTab) ? activeSubTab : "all";
  const visibleCourses = useMemo(
    () => baseCourses.filter((course) => filterBySubTab(course, effectiveSubTab)),
    [baseCourses, effectiveSubTab]
  );

  function toggleCourse(courseId: string, checked: boolean) {
    setSelectedCourseIds((current) => {
      if (checked) {
        return normalizeSelectedCourseIds(plan, [...current, courseId]);
      }

      return current.filter((id) => id !== courseId);
    });
  }

  function resetSelection() {
    if (window.confirm("לנקות את כל הקורסים שסומנו?")) {
      setSelectedCourseIds([]);
    }
  }

  function exportSelection() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            selectedCourseIds,
            exportedAt: new Date().toISOString(),
            source: plan.source,
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "braude-degree-progress.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importSelection(file: File | undefined) {
    if (!file) {
      return;
    }

    const parsed = JSON.parse(await file.text()) as { selectedCourseIds?: unknown };

    if (Array.isArray(parsed.selectedCourseIds)) {
      setSelectedCourseIds(
        normalizeSelectedCourseIds(
          plan,
          parsed.selectedCourseIds.filter((id): id is string => typeof id === "string")
        )
      );
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">B.Sc.</Badge>
                <Badge variant="outline">עמודים {plan.source.pages}</Badge>
                <Badge variant="outline">160 {'נ"ז'}</Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">{plan.title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{plan.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportSelection}>
                <Download /> יצוא
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload /> יבוא
              </Button>
              <Button variant="destructive" onClick={resetSelection}>
                <RotateCcw /> ניקוי
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => importSelection(event.currentTarget.files?.[0])}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={GraduationCap}
              label={'נק"ז שסומנו'}
              value={`${formatCredits(audit.totalCreditsCompleted)}/${plan.requirements.totalCredits}`}
              detail={`${audit.totalCreditsRemaining} נ"ז עד המינימום לתואר`}
              progress={audit.completionPercent}
              tone={audit.totalCreditsRemaining === 0 ? "success" : "default"}
            />
            <MetricCard
              icon={BookOpen}
              label="חובה וליבה"
              value={`${formatCredits(audit.fixedCreditsCompleted)}/${plan.requirements.fixedDegreeCredits}`}
              detail={`${formatCredits(audit.fixedCreditsRemaining)} נ"ז חובה/כללי/פיזיקה נשארו`}
              progress={(audit.fixedCreditsCompleted / plan.requirements.fixedDegreeCredits) * 100}
            />
            <MetricCard
              icon={Filter}
              label="בחירה והשלמה"
              value={`${formatCredits(audit.electiveCreditsCompleted)}/${plan.requirements.electiveCreditsNeeded}`}
              detail={`${formatCredits(audit.electiveCreditsRemaining)} נ"ז בחירה להשלמה`}
              progress={(audit.electiveCreditsCompleted / plan.requirements.electiveCreditsNeeded) * 100}
            />
            <MetricCard
              icon={LockKeyhole}
              label="חסימות"
              value={audit.blockedCourses.length.toString()}
              detail={`${audit.availableCourses.length} קורסים זמינים לפי תנאי קדם`}
              tone={audit.blockedCourses.length ? "warning" : "success"}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <section className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>קורסים</CardTitle>
              <CardDescription>
                {visibleCourses.length} מתוך {baseCourses.length} פריטים במסנן הנוכחי
                {pending ? " - מחשב..." : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="חיפוש לפי שם, מספר קורס או אשכול"
                  className="h-10 pr-9"
                />
              </div>
              <Tabs
                value={activeTab}
                onValueChange={(value) => {
                  setActiveTab(value);
                  setActiveSubTab("all");
                }}
              >
                <TabsList>
                  {filterTabs.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <div className="rounded-lg border bg-muted/25 p-2">
                  <Tabs value={effectiveSubTab} onValueChange={setActiveSubTab}>
                    <TabsList className="bg-transparent p-0">
                      {subTabs.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value} className="h-8 gap-1 px-2.5">
                          <span>{tab.label}:</span>
                          <span className="font-mono text-[0.7rem] text-muted-foreground">{tab.count}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
                <TabsContent value={activeTab} className="mt-4">
                  <div className="overflow-hidden rounded-lg border">
                    {visibleCourses.length ? (
                      visibleCourses.map((course) => {
                        const courseAudit = auditByCourseId.get(course.id);

                        if (!courseAudit) {
                          return null;
                        }

                        return (
                          <CourseRow
                            key={course.id}
                            audit={courseAudit}
                            plan={plan}
                            courseTypeLabel={courseTypeLabelByCode.get(course.type) ?? course.type}
                            selected={selectedSet.has(course.id)}
                            onToggle={toggleCourse}
                          />
                        );
                      })
                    ) : (
                      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                        אין קורסים מתאימים לסינון הנוכחי.
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>תמונת מצב</CardTitle>
              <CardDescription>
                {audit.selectedCourseIds.length} קורסים/פטורים סומנו
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {audit.warnings.length ? (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {audit.warnings.map((warning) => (
                    <div key={warning} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span className="leading-5">{warning}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <RequirementList audit={audit} />
              <Separator />
              <ClusterList audit={audit} />
              <Separator />
              <BlockedList audit={audit} />
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>מקור וכללים</CardTitle>
              <CardDescription>{plan.source.fileName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {plan.notes.map((note) => (
                <div key={note} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-600" />
                  <span>{note}</span>
                </div>
              ))}
              {audit.conversionCreditsAppliedToGeneral ? (
                <div className="text-sm leading-6 text-muted-foreground">
                  {formatCredits(audit.conversionCreditsAppliedToGeneral)} {'נ"ז'} מההמרה נספרות כרגע במקום
                  לימודים כלליים.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
