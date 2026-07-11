import Link from "next/link";
import { Archive, ArrowLeft, CalendarDays, GraduationCap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProgramList, type ProgramSummary } from "@/lib/db/degree-repository";

export const dynamic = "force-dynamic";

function isGraduate(programId: string) {
  return programId.startsWith("msc-");
}

function ProgramGrid({ programs }: { programs: ProgramSummary[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((program) => (
        <Link key={program.id} href={`/p/${program.id}`}>
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-2">
                <span>{program.title}</span>
                {program.catalogYear ? (
                  <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                    {program.catalogYear}
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription>{program.subtitle}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function ProgramPickerPage() {
  const programs = getProgramList();
  const active = programs.filter((program) => program.status !== "archived");
  const archived = programs.filter((program) => program.status === "archived");
  const bachelors = active.filter((program) => !isGraduate(program.id));
  const masters = active.filter((program) => isGraduate(program.id));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/60">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-4 px-4 py-10 sm:px-6 lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <GraduationCap className="size-8 text-primary" />
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">מפת תואר | בראודה</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              בחרו תוכנית לימודים כדי לעקוב אחר קורסים, תנאי קדם ונקודות זכות לתואר.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/timetable/free" className="group block">
          <div
            className="relative overflow-hidden rounded-xl bg-primary text-primary-foreground ring-1 ring-foreground/10 transition-shadow group-hover:shadow-lg"
            style={{
              backgroundImage:
                "linear-gradient(color-mix(in oklab, var(--primary-foreground) 7%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--primary-foreground) 7%, transparent) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          >
            <div className="flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:px-7">
              <div className="grid size-14 shrink-0 place-items-center border border-primary-foreground/25 bg-primary-foreground/10">
                <CalendarDays className="size-7" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold sm:text-2xl">בנאי מערכת שעות</h2>
                <p className="mt-1 text-sm leading-6 text-primary-foreground/85">
                  הרכיבו מערכת שבועית מקבוצות אמיתיות — הרצאות, תרגולים ומעבדות — עם חלופות ללא חפיפות וימים חופשיים לבחירתכם.
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 self-start border border-primary-foreground/30 px-4 py-2 text-sm font-medium transition-colors group-hover:bg-primary-foreground/10 sm:self-center">
                לבניית מערכת
                <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
              </span>
            </div>
          </div>
        </Link>

        {programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            לא נמצאו תוכניות לימוד. יש להריץ את סקריפט הזריעה (npm run db:seed).
          </p>
        ) : null}

        {bachelors.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-muted-foreground">תארי בוגר (B.Sc.)</h2>
            <ProgramGrid programs={bachelors} />
          </section>
        ) : null}

        {masters.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-muted-foreground">תארי מוסמך (M.Sc.)</h2>
            <ProgramGrid programs={masters} />
          </section>
        ) : null}

        {archived.length ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-medium text-muted-foreground">
              <Archive className="size-4" />
              תוכניות שנסגרו / מהדורות קודמות
            </h2>
            <p className="text-sm text-muted-foreground">
              תוכניות אלה אינן פעילות עוד בשנתון הנוכחי, אך נשמרות לסטודנטים שהחלו בהן.
            </p>
            <ProgramGrid programs={archived} />
          </section>
        ) : null}
      </main>
    </div>
  );
}
