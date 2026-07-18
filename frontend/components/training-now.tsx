import Link from "next/link";
import { Bike, Check, ChevronRight, Dumbbell, Footprints, MoonStar } from "lucide-react";
import type { DailyAgendaItem } from "@/lib/types";

const fullDate = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

function AgendaIcon({ category }: { category: DailyAgendaItem["category"] }) {
  if (category === "run") return <Footprints size={24} />;
  if (category === "strength") return <Dumbbell size={24} />;
  if (category === "bike") return <Bike size={24} />;
  return <MoonStar size={24} />;
}

export function TrainingNow({
  agenda,
  completedDates = [],
}: {
  agenda: DailyAgendaItem[];
  completedDates?: string[];
}) {
  const primary = agenda[0];
  const following = agenda.slice(1, 3);
  const primaryComplete = primary?.category === "run" && completedDates.includes(primary.date);

  if (!primary) return null;

  return (
    <>
      <div className="live-date" aria-live="polite">
        <span className="eyebrow">Hoy</span>
        <strong>{fullDate.format(new Date(`${primary.date}T12:00:00+02:00`))}</strong>
      </div>
      <section className={`today-card agenda-${primary.category}`}>
        <div className="today-icon"><AgendaIcon category={primary.category} /></div>
        <div className="today-copy">
          <span>{primaryComplete ? "Sesión completada" : "Lo que toca hoy"}</span>
          <h2>{primary.title}</h2>
          <p>{primary.detail} · Semana {primary.week_number}: {primary.week_target_km} km</p>
        </div>
        {primaryComplete ? (
          <span className="agenda-complete" aria-label="Entrenamiento completado"><Check size={18} /></span>
        ) : (
          <Link href="/plan" className="round-link" aria-label="Ver plan completo"><ChevronRight /></Link>
        )}
      </section>

      <section className="next-steps" aria-label="Agenda de los próximos días">
        <span className="eyebrow">Después</span>
        <div>
          {following.map((item) => (
            <article key={item.date} className={`next-step next-step-${item.category}`}>
              <small>{item.relative_label} · {item.day}</small>
              <div className="next-step-title"><AgendaIcon category={item.category} /><strong>{item.title}</strong></div>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
