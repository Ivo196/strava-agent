import { Bike, ChevronDown, Dumbbell, Footprints, LockKeyhole, MoonStar } from "lucide-react";
import { OfflineState } from "@/components/offline-state";
import { getPlan } from "@/lib/api";
import { WeeklyCheckin } from "@/components/weekly-checkin";
import { PlanCalendar } from "@/components/plan-calendar";
import type { DailyAgendaItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const dayMonth = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

function formatGoalPace(seconds: number | null) {
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function DayIcon({ category }: { category: DailyAgendaItem["category"] }) {
  if (category === "run") return <Footprints size={17} />;
  if (category === "strength") return <Dumbbell size={17} />;
  if (category === "bike") return <Bike size={17} />;
  return <MoonStar size={17} />;
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const { today } = await searchParams;
  const simulatedToday = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined;
  const data = await getPlan(simulatedToday).catch(() => null);
  if (!data) return <OfflineState />;
  const currentWeek = data.weeks.find((week) => week.number === data.current_week_number) ?? data.weeks[0];
  const goalPace = formatGoalPace(data.profile.goal_pace_seconds_km);

  return (
    <div className="page-wrap">
      <header className="simple-header">
        <span className="eyebrow">Plan de carrera · Semana {data.current_week_number ?? "—"}</span>
        <h1>Calendario de entrenamiento.</h1>
        <p>El calendario avanza solo con la fecha actual. La semana vigente se abre y se marca automáticamente con tus entrenamientos completados.</p>
      </header>
      <div className="locked-plan-note"><LockKeyhole size={18} /><div><strong>Plan bloqueado</strong><span>{data.policy} Cualquier cambio se hará únicamente si lo decidimos juntos.</span></div></div>

      {currentWeek && (
        <section className="plan-current-panel" aria-label="Semana actual del plan">
          <div>
            <span className="eyebrow">Ahora</span>
            <h2>Semana {currentWeek.number} · {currentWeek.phase}</h2>
            <p>{dayMonth.format(new Date(`${currentWeek.start}T12:00:00`))} – {dayMonth.format(new Date(`${currentWeek.end}T12:00:00`))}</p>
          </div>
          <div className="plan-current-stats">
            <div><span>Objetivo</span><strong>{currentWeek.target_km}<small> km</small></strong></div>
            <div><span>Realizado</span><strong>{currentWeek.actual_km ?? 0}<small> km</small></strong></div>
            <div><span>Estado</span><strong>{currentWeek.completion_percentage ?? 0}<small>%</small></strong></div>
          </div>
        </section>
      )}

      <section className="plan-calendar-panel" aria-label="Calendario del plan">
        <div className="section-heading">
          <div><span className="eyebrow">Calendario vivo</span><h2>Esta semana primero, sin perder el historial</h2></div>
          <span className="unit-label">{dayMonth.format(new Date(`${data.current_week_start}T12:00:00`))} – {dayMonth.format(new Date(`${data.current_week_end}T12:00:00`))}</span>
        </div>
        <PlanCalendar days={data.calendar} />
      </section>

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
        {data.weeks.map((week) => {
          const isCurrent = week.number === data.current_week_number;
          return (
            <details className={`week-card${isCurrent ? " week-card-current" : ""}`} key={week.number} open={isCurrent}>
              <summary>
                <span className="week-number">{isCurrent ? "Actual" : `Semana ${week.number}`}</span>
                <span className="week-phase"><strong>{week.phase}</strong><span>{dayMonth.format(new Date(`${week.start}T12:00:00`))} – {dayMonth.format(new Date(`${week.end}T12:00:00`))}</span></span>
                <span className="week-stat"><strong>{week.target_km} km</strong><span>volumen</span></span>
                <span className="week-stat"><strong>{week.long_run_km} km</strong><span>tirada larga</span></span>
                <ChevronDown size={17} />
              </summary>
              <div className="week-detail">
                <div className="week-badges">
                  {isCurrent && <span className={`risk-${week.risk_level.toLowerCase()}`}>Estado actual: riesgo {week.risk_level}</span>}
                  {isCurrent && <span>Objetivo {goalPace}: {week.goal_status}</span>}
                  {week.completion_percentage !== null && <span>Realizado: {week.actual_km} km · {week.completion_percentage}%</span>}
                </div>
                <ul className="session-list">{week.sessions.map((session, sessionIndex) => <li key={session}><strong>{session}</strong><small>{week.session_objectives[sessionIndex]}</small></li>)}</ul>
                <div className="cross-training"><p><strong>Fuerza</strong>{week.strength_recommendation}</p><p><strong>Bicicleta</strong>{week.bike_recommendation}</p></div>
                <p className="change-reason">{week.change_reason}</p>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
