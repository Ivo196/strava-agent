import { Dumbbell, Scale, TrendingDown, TrendingUp, Waves } from "lucide-react";
import type { BodyCompositionData, BodyCompositionMeasurement } from "@/lib/types";

const fullDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

type MetricKey = "weight_kg" | "muscle_mass_kg" | "body_fat_percent";

const metrics: { key: MetricKey; label: string; unit: string; color: string; icon: typeof Scale }[] = [
  { key: "weight_kg", label: "Peso", unit: "kg", color: "#60a5fa", icon: Scale },
  { key: "muscle_mass_kg", label: "Masa muscular", unit: "kg", color: "#24f2ce", icon: Dumbbell },
  { key: "body_fat_percent", label: "Grasa corporal", unit: "%", color: "#f4b860", icon: Waves },
];

function delta(current: number, previous: number | null | undefined) {
  return previous == null ? null : Math.round((current - previous) * 10) / 10;
}

function TrendChart({ items, metric }: { items: BodyCompositionMeasurement[]; metric: typeof metrics[number] }) {
  const values = items.map((item) => item[metric.key]).filter((value): value is number => value != null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, metric.key === "body_fat_percent" ? 2 : 1);
  const lower = min - spread * 0.2;
  const upper = max + spread * 0.2;
  const x = (index: number) => items.length === 1 ? 160 : 18 + (index / (items.length - 1)) * 284;
  const y = (value: number) => 96 - ((value - lower) / (upper - lower)) * 72;
  const points = items.map((item, index) => `${x(index)},${y(item[metric.key]!)}`).join(" ");

  return (
    <article className="body-trend-card">
      <div className="body-trend-heading">
        <span><metric.icon size={17} /> {metric.label}</span>
        <strong>{values.at(-1)?.toFixed(1)} <small>{metric.unit}</small></strong>
      </div>
      <svg viewBox="0 0 320 118" role="img" aria-label={`Tendencia de ${metric.label.toLowerCase()} en ${items.length} mediciones`}>
        <path className="body-chart-grid" d="M18 24H302M18 60H302M18 96H302" />
        {items.length > 1 && <polyline points={points} fill="none" stroke={metric.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {items.map((item, index) => (
          <circle key={item.id} cx={x(index)} cy={y(item[metric.key]!)} r="4" fill={metric.color} stroke="#07101f" strokeWidth="2">
            <title>{`${shortDate.format(new Date(`${item.measurement_date}T12:00:00`))}: ${item[metric.key]} ${metric.unit}`}</title>
          </circle>
        ))}
        <text x="18" y="114">{shortDate.format(new Date(`${items[0].measurement_date}T12:00:00`))}</text>
        {items.length > 1 && <text x="302" y="114" textAnchor="end">{shortDate.format(new Date(`${items.at(-1)!.measurement_date}T12:00:00`))}</text>}
      </svg>
    </article>
  );
}

export function BodyCompositionView({ data }: { data: BodyCompositionData }) {
  const chronological = [...data.measurements].reverse();
  const latest = data.latest;
  const availableMetrics = metrics.filter((metric) =>
    data.measurements.some((item) => item[metric.key] != null),
  );
  const hasNotes = data.measurements.some((item) => Boolean(item.notes));

  return (
    <div className="body-composition-layout">
      <section className="body-latest-panel" aria-label="Última medición corporal">
        <div className="body-panel-heading">
          <div>
            <span className="eyebrow">Última lectura automática</span>
            <h2>{latest ? fullDate.format(new Date(`${latest.measurement_date}T12:00:00`)) : "Esperando sincronización"}</h2>
          </div>
          {latest && <span className="unit-label">Fuente: {latest.source}</span>}
        </div>

        {latest ? (
          <div className="body-latest-grid">
            {availableMetrics.map((metric) => {
              const measurement = data.measurements.find((item) => item[metric.key] != null)!;
              const previous = data.measurements.find((item) => item.measurement_date < measurement.measurement_date && item[metric.key] != null);
              const value = measurement[metric.key]!;
              const change = delta(value, previous?.[metric.key]);
              return (
                <article key={metric.key}>
                  <span className="body-metric-icon"><metric.icon size={19} /></span>
                  <div><small>{metric.label}</small><strong>{value.toFixed(1)} <b>{metric.unit}</b></strong></div>
                  <span className={change == null ? "body-delta neutral" : change > 0 ? "body-delta up" : change < 0 ? "body-delta down" : "body-delta neutral"}>
                    {change == null ? "Línea base" : <>{change > 0 ? <TrendingUp size={14} /> : change < 0 ? <TrendingDown size={14} /> : null}{change > 0 ? "+" : ""}{change} {metric.unit}</>}
                  </span>
                </article>
              );
            })}
          </div>
        ) : <p className="empty-row">La sección aparecerá cuando Fitbit sincronice una lectura de peso.</p>}
        <p className="body-context-note">Compara tendencias tomadas en condiciones parecidas. Hidratación, comida, ejercicio y hora del día pueden cambiar una lectura de bioimpedancia.</p>
      </section>

      {chronological.length > 0 && (
        <>
          <section className="body-trends-section" aria-label="Tendencias de composición corporal">
            <div className="section-heading"><div><span className="eyebrow">Progreso</span><h2>Evolución por medición</h2></div><span className="unit-label">{data.count} {data.count === 1 ? "registro" : "registros"}</span></div>
            <div className="body-trends-grid">{availableMetrics.map((metric) => <TrendChart key={metric.key} items={chronological.filter((item) => item[metric.key] != null)} metric={metric} />)}</div>
          </section>

          <section className="body-history-section">
            <div className="section-heading"><div><span className="eyebrow">Historial</span><h2>Todas las mediciones</h2></div></div>
            <div className="table-scroll"><table className="data-table body-history-table">
              <thead><tr><th>Fecha</th><th>Peso</th>{availableMetrics.some((metric) => metric.key === "muscle_mass_kg") && <th>Masa muscular</th>}{availableMetrics.some((metric) => metric.key === "body_fat_percent") && <th>Grasa corporal</th>}<th>Fuente</th>{hasNotes && <th>Notas</th>}</tr></thead>
              <tbody>{data.measurements.map((item) => <tr key={item.id}>
                <td><strong>{fullDate.format(new Date(`${item.measurement_date}T12:00:00`))}</strong></td>
                <td>{item.weight_kg.toFixed(1)} kg</td>
                {availableMetrics.some((metric) => metric.key === "muscle_mass_kg") && <td>{item.muscle_mass_kg != null ? `${item.muscle_mass_kg.toFixed(1)} kg` : "No medido"}</td>}
                {availableMetrics.some((metric) => metric.key === "body_fat_percent") && <td>{item.body_fat_percent != null ? `${item.body_fat_percent.toFixed(1)}%` : "No medido"}</td>}
                <td>{item.source}</td>{hasNotes && <td>{item.notes}</td>}
              </tr>)}</tbody>
            </table></div>
          </section>
        </>
      )}
    </div>
  );
}
