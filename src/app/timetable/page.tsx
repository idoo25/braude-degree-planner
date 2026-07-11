import Link from "next/link";
import { ArrowRight, CalendarDays, GraduationCap } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProgramList } from "@/lib/db/degree-repository";

export const dynamic = "force-dynamic";

function isGraduate(programId: string) {
  return programId.startsWith("msc-");
}

export default function TimetableProgramPickerPage() {
  const programs = getProgramList();
  const activePrograms = programs.filter((program) => program.status !== "archived");
  const archivedPrograms = programs.filter((program) => program.status === "archived");
  const bachelors = activePrograms.filter((program) => !isGraduate(program.id));
  const masters = activePrograms.filter((program) => isGraduate(program.id));
  const archivedBachelors = archivedPrograms.filter((program) => !isGraduate(program.id));
  const archivedMasters = archivedPrograms.filter((program) => isGraduate(program.id));

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="border-b bg-card/60">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-4 py-7 sm:px-6 lg:px-8">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <CalendarDays className="size-6" />
              <span className="text-sm font-medium">מערכת שעות</span>
            </div>
            <h1 className="text-3xl font-semibold">בחירת מסלול</h1>
            <p className="mt-2 text-sm text-muted-foreground">בחרו תוכנית לימודים כדי לעבוד עם חוקי התואר, או עברו למערכת חופשית.</p>
          </div>
          <Link href="/" className="inline-flex h-9 items-center gap-2 border border-input px-3 text-sm font-medium transition-colors hover:bg-muted">
            <ArrowRight className="size-4" />מפת התואר
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="border-y py-5">
          <Link href="/timetable/free" className="block">
            <Card className="border-primary/35 transition-colors hover:bg-primary/5">
              <CardHeader className="flex-row items-center gap-3">
                <div className="grid size-10 place-items-center border border-primary/30 bg-primary/10 text-primary"><GraduationCap className="size-5" /></div>
                <div>
                  <CardTitle>מערכת חופשית</CardTitle>
                  <CardDescription>כל הקורסים המתוזמנים, ללא מפת תואר, דרישות קדם או חסימות תוכנית.</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </section>

        {bachelors.length ? (
          <section className="space-y-3">
            <h2 className="text-base font-medium text-muted-foreground">תואר ראשון</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bachelors.map((program) => (
                <Link key={program.id} href={`/p/${program.id}/timetable`}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle>{program.title}</CardTitle>
                      <CardDescription>{program.subtitle}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {masters.length ? (
          <section className="space-y-3">
            <h2 className="text-base font-medium text-muted-foreground">תואר שני</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {masters.map((program) => (
                <Link key={program.id} href={`/p/${program.id}/timetable`}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle>{program.title}</CardTitle>
                      <CardDescription>{program.subtitle}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {archivedBachelors.length || archivedMasters.length ? (
          <section className="space-y-5 border-t pt-6">
            <h2 className="text-base font-medium text-muted-foreground">ארכיון שנתונים קודמים</h2>
            {archivedBachelors.length ? (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">תואר ראשון</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {archivedBachelors.map((program) => (
                    <Link key={program.id} href={`/p/${program.id}/timetable`}>
                      <Card className="h-full border-dashed transition-shadow hover:shadow-md">
                        <CardHeader>
                          <CardTitle>{program.title}</CardTitle>
                          <CardDescription>{program.catalogYear ?? program.subtitle}</CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {archivedMasters.length ? (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">תואר שני</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {archivedMasters.map((program) => (
                    <Link key={program.id} href={`/p/${program.id}/timetable`}>
                      <Card className="h-full border-dashed transition-shadow hover:shadow-md">
                        <CardHeader>
                          <CardTitle>{program.title}</CardTitle>
                          <CardDescription>{program.catalogYear ?? program.subtitle}</CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
