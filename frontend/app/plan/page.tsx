import Link from "next/link";
import { ArrowRight, Dumbbell, LockKeyhole, Percent, Scale } from "lucide-react";
import { OfflineState } from "@/components/offline-state";
import { getPlan } from "@/lib/api";
import { PlanCalendar } from "@/components/plan-calendar";

export const dynamic = "force-dynamic";

const dayMonth = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatChange(value: number, unit: string) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${oneDecimal.format(Math.abs(value))} ${unit}`;
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const { today } = await searchParams;
  const simulatedToday = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined;
  const data = await getPlan(simulatedToday).catch(() => null);
  if (!data) return <OfflineState />;
  const currentWeek = data.weeks.find((week) => week.number === data.current_week_number) ?? data.weeks[0];
  const composition = data.body_composition;

  return (
    <div className="page-wrap">
      <header className="simple-header">
        <span className="eyebrow">Semana {data.current_week_number ?? "—"} · Chicago 2026</span>
        <h1>Calendario</h1>
        <p>Lo que toca y lo que realmente hiciste.</p>
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

      {composition && (
        <section className="plan-body-context" aria-labelledby="plan-body-title">
          <header>
            <div>
              <span className="eyebrow">Referencia InBody · {dayMonth.format(new Date(`${composition.latest.measurement_date}T12:00:00`))}</span>
              <h2 id="plan-body-title">Composición corporal en contexto</h2>
            </div>
            <Link href="/body">Ver evolución <ArrowRight size={15} aria-hidden="true" /></Link>
          </header>
          <div className="plan-body-metrics">
            <article>
              <Scale size={18} aria-hidden="true" />
              <span>Peso</span>
              <strong>{oneDecimal.format(composition.latest.weight_kg)} <small>kg</small></strong>
              {composition.change_since_previous && <small>{formatChange(composition.change_since_previous.weight_kg, "kg")} desde la anterior</small>}
            </article>
            <article>
              <Dumbbell size={18} aria-hidden="true" />
              <span>Masa muscular</span>
              <strong>{oneDecimal.format(composition.latest.muscle_mass_kg ?? 0)} <small>kg</small></strong>
              {composition.change_since_previous && <small>{formatChange(composition.change_since_previous.muscle_mass_kg, "kg")} desde la anterior</small>}
            </article>
            <article>
              <Percent size={18} aria-hidden="true" />
              <span>Grasa corporal</span>
              <strong>{oneDecimal.format(composition.latest.body_fat_percent ?? 0)}<small>%</small></strong>
              {composition.change_since_previous && <small>{formatChange(composition.change_since_previous.body_fat_percent, "pt")} desde la anterior</small>}
            </article>
          </div>
          <p><strong>Cómo entra en el plan.</strong> {composition.guidance}</p>
        </section>
      )}

      <section className="plan-calendar-panel" aria-label="Calendario del plan">
        <div className="section-heading">
          <div><span className="eyebrow">Calendario semanal</span><h2>Tu plan, semana por semana</h2><p>De lunes a domingo. Abre una semana para ver cada sesión.</p></div>
          <span className="unit-label">{dayMonth.format(new Date(`${data.current_week_start}T12:00:00`))} – {dayMonth.format(new Date(`${data.current_week_end}T12:00:00`))}</span>
        </div>
        <PlanCalendar days={data.calendar} />
      </section>

    </div>
  );
}
