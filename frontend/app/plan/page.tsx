import { Bike, ChevronDown, Dumbbell, Footprints, LockKeyhole, MoonStar } from "lucide-react";
import { OfflineState } from "@/components/offline-state";
import { getPlan } from "@/lib/api";
import { WeeklyCheckin } from "@/components/weekly-checkin";
import type { DailyAgendaItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const dayMonth = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

function DayIcon({ category }: { category: DailyAgendaItem["category"] }) {
  if (category === "run") return <Footprints size={17} />;
  if (category === "strength") return <Dumbbell size={17} />;
  if (category === "bike") return <Bike size={17} />;
  return <MoonStar size={17} />;
}

export default async function PlanPage() {
  const data = await getPlan().catch(() => null);
  if (!data) return <OfflineState />;
  return (
    <div className="page-wrap">
      <header className="simple-header">
        <span className="eyebrow">Plan de carrera</span>
        <h1>Calendario de entrenamiento.</h1>
        <p>El calendario no cambia al importar actividades. Tus datos sirven para evaluar cómo vas y qué puedes mejorar.</p>
      </header>
      <div className="locked-plan-note"><LockKeyhole size={18} /><div><strong>Plan bloqueado</strong><span>{data.policy} Cualquier cambio se hará únicamente si lo decidimos juntos.</span></div></div>
      <section className="daily-week-panel" aria-label="Agenda de los próximos siete días">
        <div className="section-heading"><div><span className="eyebrow">Día por día</span><h2>Próximos 7 días</h2></div></div>
        <div className="daily-week-grid">
          {data.daily_agenda.map((item) => (
            <article key={item.date} className={`daily-week-item daily-week-${item.category}`}>
              <div className="daily-week-icon"><DayIcon category={item.category} /></div>
              <small>{item.relative_label} · {dayMonth.format(new Date(`${item.date}T12:00:00`))}</small>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
      <WeeklyCheckin />
      <div className="week-list">
        {data.weeks.map((week, index) => (
          <details className="week-card" key={week.number} open={index === 0}>
            <summary>
              <span className="week-number">Semana {week.number}</span>
              <span className="week-phase"><strong>{week.phase}</strong><span>{dayMonth.format(new Date(`${week.start}T12:00:00`))} – {dayMonth.format(new Date(`${week.end}T12:00:00`))}</span></span>
              <span className="week-stat"><strong>{week.target_km} km</strong><span>volumen</span></span>
              <span className="week-stat"><strong>{week.long_run_km} km</strong><span>tirada larga</span></span>
              <ChevronDown size={17} />
            </summary>
            <div className="week-detail">
              <div className="week-badges">
                {index === 0 && <span className={`risk-${week.risk_level.toLowerCase()}`}>Estado actual: riesgo {week.risk_level}</span>}
                {index === 0 && <span>Objetivo 4:55: {week.goal_status}</span>}
                {week.completion_percentage !== null && <span>Realizado: {week.actual_km} km · {week.completion_percentage}%</span>}
              </div>
              <ul className="session-list">{week.sessions.map((session, sessionIndex) => <li key={session}><strong>{session}</strong><small>{week.session_objectives[sessionIndex]}</small></li>)}</ul>
              <div className="cross-training"><p><strong>Fuerza</strong>{week.strength_recommendation}</p><p><strong>Bicicleta</strong>{week.bike_recommendation}</p></div>
              <p className="change-reason">{week.change_reason}</p>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
