import { BedDouble, Clock3, Gauge, MoonStar } from "lucide-react";
import { MetricTrend } from "@/components/metric-trend";
import { OfflineState } from "@/components/offline-state";
import { getDashboard } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SleepPage() {
  const data = await getDashboard().catch(() => null);
  if (!data) return <OfflineState />;
  const sleep = data.daily_state.sleep_utility;
  const trend = sleep.trend.map((day) => ({ date: day.date, value: day.hours }));

  return (
    <div className="page-wrap insight-page">
      <header className="simple-header">
        <span className="eyebrow">Recuperación nocturna</span>
        <h1>Sueño.</h1>
        <p>Duración, deuda, eficiencia y regularidad convertidas en una recomendación útil.</p>
      </header>
      <section className="sleep-score-grid" aria-label="Resumen de sueño">
        {sleep.average_hours != null && <article><BedDouble /><span>Media 7 días</span><strong>{sleep.average_hours}<small> h</small></strong></article>}
        {sleep.debt_hours != null && <article><Clock3 /><span>Deuda acumulada</span><strong>{sleep.debt_hours}<small> h</small></strong></article>}
        {sleep.consistency != null && <article><MoonStar /><span>Consistencia</span><strong>{sleep.consistency}<small>/100</small></strong></article>}
        {sleep.efficiency != null && <article><Gauge /><span>Eficiencia</span><strong>{sleep.efficiency}<small>%</small></strong></article>}
      </section>
      <section className="sleep-guidance-card">
        <span className="pace-kicker">Guía para entrenar</span>
        <h2>{sleep.debt_hours != null && sleep.debt_hours >= 5 ? "Protege la recuperación" : "Sueño bajo control"}</h2>
        <p>{sleep.guidance}</p>
      </section>
      <section className="metric-trend-grid single-trend">
        <MetricTrend title="Duración nocturna" unit="h" items={trend} tone="purple" />
      </section>
    </div>
  );
}
