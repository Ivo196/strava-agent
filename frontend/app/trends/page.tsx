import { MetricTrend } from "@/components/metric-trend";
import { OfflineState } from "@/components/offline-state";
import { getDashboard } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const data = await getDashboard().catch(() => null);
  if (!data) return <OfflineState />;
  const trends = data.daily_state.trends;
  const hrv = trends.recovery.flatMap((day) => day.hrv == null ? [] : [{ date: day.date, value: day.hrv }]);
  const resting = trends.recovery.flatMap((day) => day.resting_hr == null ? [] : [{ date: day.date, value: day.resting_hr }]);
  const sleep = trends.sleep.map((day) => ({ date: day.date, value: day.hours }));
  const load = trends.load.map((day) => ({ date: day.date, value: day.total }));
  const availableDays = Math.max(hrv.length, resting.length, sleep.length, load.length);

  return (
    <div className="page-wrap insight-page">
      <header className="simple-header">
        <span className="eyebrow">Tu línea personal</span>
        <h1>Tendencias.</h1>
        <p>Cómo cambian tus señales con el tiempo, sin confundir asociación con causa.</p>
      </header>
      <section className="trend-range-note">
        <strong>{availableDays} días disponibles</strong>
        <span>PaceOS ampliará automáticamente la vista hacia 30 y 90 días cuando exista historial suficiente.</span>
      </section>
      <section className="metric-trend-grid" aria-label="Tendencias fisiológicas">
        <MetricTrend title="HRV nocturna" unit="ms" items={hrv} tone="cyan" />
        <MetricTrend title="Pulso en reposo" unit="bpm" items={resting} tone="amber" />
        <MetricTrend title="Sueño" unit="h" items={sleep} tone="purple" />
        <MetricTrend title="Carga semanal" unit="pts" items={load} tone="blue" />
      </section>
      <section className="trend-insight-card">
        <span className="pace-kicker">Relaciones personales</span>
        <h2>Aún estamos construyendo evidencia</h2>
        <p>Cuando haya suficientes noches comparables, PaceOS mostrará asociaciones como sueño–HRV o carga–recuperación. Nunca afirmará causalidad.</p>
      </section>
    </div>
  );
}
