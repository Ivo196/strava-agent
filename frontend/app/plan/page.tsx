import { OfflineState } from "@/components/offline-state";
import { getPlan } from "@/lib/api";
import { PlanCalendar } from "@/components/plan-calendar";

export const dynamic = "force-dynamic";

const dayMonth = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const { today } = await searchParams;
  const simulatedToday = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined;
  const data = await getPlan(simulatedToday).catch(() => null);
  if (!data) return <OfflineState />;
  return (
    <div className="page-wrap">
      <header className="simple-header">
        <span className="eyebrow">Semana {data.current_week_number ?? "—"} · Chicago 2026</span>
        <h1>Calendario</h1>
        <p>Lo que toca y lo que realmente hiciste.</p>
      </header>
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
