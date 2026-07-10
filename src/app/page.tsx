import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProgramList } from "@/lib/db/degree-repository";

export const dynamic = "force-dynamic";

function isGraduate(programId: string) {
  return programId.startsWith("msc-");
}

export default function ProgramPickerPage() {
  const programs = getProgramList();
  const bachelors = programs.filter((program) => !isGraduate(program.id));
  const masters = programs.filter((program) => isGraduate(program.id));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/60">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <GraduationCap className="size-8 text-primary" />
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">מפת תואר | בראודה</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            בחרו תוכנית לימודים כדי לעקוב אחר קורסים, תנאי קדם ונקודות זכות לתואר.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            לא נמצאו תוכניות לימוד. יש להריץ את סקריפט הזריעה (npm run db:seed).
          </p>
        ) : null}

        {bachelors.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-muted-foreground">תארי בוגר (B.Sc.)</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bachelors.map((program) => (
                <Link key={program.id} href={`/p/${program.id}`}>
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
            <h2 className="text-lg font-medium text-muted-foreground">תארי מוסמך (M.Sc.)</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {masters.map((program) => (
                <Link key={program.id} href={`/p/${program.id}`}>
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
      </main>
    </div>
  );
}
