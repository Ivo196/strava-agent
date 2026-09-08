import { ArrowRight, CalendarDays, ExternalLink, Flag, Fuel, ShieldAlert, Star } from "lucide-react";
import type { TrainingWeek } from "@/lib/types";

const workoutDate = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" });
const raceDateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" });

export function LongRunProgression({ weeks, raceDate }: { weeks: TrainingWeek[]; raceDate: string }) {
  const keyWeeks = weeks.filter((week) => week.long_run_plan).slice(0, 3);
  if (!keyWeeks.length) return null;

  return (
    <section className="long-run-block" aria-labelledby="long-run-block-title">
      <header className="long-run-block-header">
        <div>
          <span className="eyebrow">Bloque final · rumbo a Chicago</span>
          <h2 id="long-run-block-title">24 → 28 → 32 km</h2>
          <p>Tres fondos progresivos. Subimos distancia, no distancia e intensidad al mismo tiempo.</p>
        </div>
        <span className="long-run-taper-badge"><Flag aria-hidden="true" size={15} /> Después, 2 semanas de taper</span>
      </header>

      <div className="long-run-workouts">
        {keyWeeks.map((week, index) => {
          const plan = week.long_run_plan;
          if (!plan) return null;
          return (
            <article className={`long-run-workout${plan.is_peak ? " is-peak" : ""}`} key={week.number}>
              <header>
                <span><CalendarDays aria-hidden="true" size={14} /> {workoutDate.format(new Date(`${week.start}T12:00:00`).getTime() + 5 * 86400000)}</span>
                {plan.is_peak && <b><Star aria-hidden="true" size={12} /> Sesión clave</b>}
              </header>
              <div className="long-run-distance"><strong>{week.long_run_km}</strong><small>km</small></div>
              <p>{plan.objective}</p>
              <div className="long-run-pace-grid" role="table" aria-label={`Bloques de ritmo para ${week.long_run_km} kilómetros`}>
                {plan.segments.map((segment) => (
                  <div role="row" key={segment.distance}>
                    <span role="cell">{segment.distance}</span>
                    <strong role="cell">{segment.pace}</strong>
                    {segment.note && <small role="cell">{segment.note}</small>}
                  </div>
                ))}
              </div>
              <footer><ShieldAlert aria-hidden="true" size={14} /><span>{plan.guardrail}</span></footer>
              {index < keyWeeks.length - 1 && <ArrowRight aria-hidden="true" className="long-run-step-arrow" size={18} />}
            </article>
          );
        })}
      </div>

      <div className="long-run-support-grid">
        <article className="long-run-fuel-card">
          <div className="long-run-support-icon"><Fuel aria-hidden="true" size={19} /></div>
          <div>
            <span className="eyebrow">Combustible · practicar en los tres</span>
            <h3>La estrategia de Chicago empieza acá</h3>
            <p>Empezá a consumir carbohidratos a los 25–30 minutos, antes de que aparezca el cansancio.</p>
            <a href="https://pubmed.ncbi.nlm.nih.gov/24791914/" target="_blank" rel="noreferrer">Ver respaldo <ExternalLink aria-hidden="true" size={12} /></a>
          </div>
          <div className="long-run-fuel-numbers">
            <span><strong>≈60</strong><small>g carbohidratos/h · sesiones de 2–3 h</small></span>
            <span><strong>hasta 90</strong><small>g/h · solo &gt;2,5 h y con el sistema digestivo entrenado</small></span>
          </div>
        </article>

        <article className="long-run-condition-card">
          <ShieldAlert aria-hidden="true" size={20} />
          <div>
            <span className="eyebrow">Condición para los 32 km</span>
            <h3>Recuperado y sin dolor</h3>
            <p>El fondo de 32 km se hace solo si después del de 28 km no hay dolor que altere tu forma de correr.</p>
          </div>
        </article>
      </div>

      <div className="long-run-finish-line" aria-label="Progresión hasta la maratón de Chicago">
        <span>12 sep <strong>24 km</strong></span><ArrowRight aria-hidden="true" size={14} />
        <span>19 sep <strong>28 km</strong></span><ArrowRight aria-hidden="true" size={14} />
        <span>26 sep <strong>32 km</strong></span><ArrowRight aria-hidden="true" size={14} />
        <span>2 semanas <strong>Taper</strong></span><ArrowRight aria-hidden="true" size={14} />
        <span className="is-race"><Flag aria-hidden="true" size={14} /> {raceDateFormat.format(new Date(`${raceDate}T12:00:00`))} <strong>Chicago 42,2</strong></span>
        <a href="https://pubmed.ncbi.nlm.nih.gov/17762369/" target="_blank" rel="noreferrer" aria-label="Ver respaldo científico del taper"><ExternalLink aria-hidden="true" size={12} /></a>
      </div>
    </section>
  );
}
