"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, ChevronRight } from "lucide-react";
import type { TrainingWeek } from "@/lib/types";
import { localNow } from "@/lib/local-clock";

const dayIndex: Record<string, number> = {
  domingo: 7,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
};

const fullDate = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function sessionDay(session: string): number | null {
  const label = session.split(":", 1)[0].trim().toLocaleLowerCase("es-ES");
  return dayIndex[label] ?? null;
}

export function TrainingNow({ weeks, completedDates = [] }: { weeks: TrainingWeek[]; completedDates?: string[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const refresh = () => setNow(localNow());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const upcoming = useMemo(() => {
    if (!now) return [];
    return weeks.flatMap((week, weekIndex) =>
      week.sessions
        .filter((session) => {
          if (weekIndex > 0) return true;
          const index = sessionDay(session);
          const currentDay = now.getDay() || 7;
          if (index === null || index > currentDay) return true;
          if (index < currentDay) return false;
          const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          return !completedDates.includes(todayKey);
        })
        .map((session) => ({ session, week })),
    ).slice(0, 3);
  }, [completedDates, now, weeks]);

  const primary = upcoming[0];
  const following = upcoming.slice(1);

  return (
    <>
      <div className="live-date" aria-live="polite">
        <span className="eyebrow">Hoy</span>
        <strong>{now ? fullDate.format(now) : "Actualizando fecha…"}</strong>
      </div>
      <section className="today-card">
        <div className="today-icon"><CalendarCheck size={24} /></div>
        <div className="today-copy">
          <span>Próxima sesión</span>
          <h2>{primary?.session ?? "No hay otra sesión programada esta semana"}</h2>
          <p>{primary ? `${primary.week.phase} · ${primary.week.target_km} km esta semana` : "Revisaremos el siguiente bloque del plan"}</p>
        </div>
        <Link href="/plan" className="round-link" aria-label="Ver plan completo"><ChevronRight /></Link>
      </section>

      {following.length > 0 && (
        <section className="next-steps" aria-label="Siguientes pasos del entrenamiento">
          <span className="eyebrow">Después</span>
          <div>
            {following.map(({ session }, index) => (
              <article key={`${session}-${index}`}><small>Próximo {index + 2}</small><strong>{session}</strong></article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
