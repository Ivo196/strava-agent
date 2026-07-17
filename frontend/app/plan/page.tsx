import { ChevronDown, LockKeyhole } from "lucide-react";
import { OfflineState } from "@/components/offline-state";
import { getPlan } from "@/lib/api";
import { WeeklyCheckin } from "@/components/weekly-checkin";

export const dynamic = "force-dynamic";

const dayMonth = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

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
