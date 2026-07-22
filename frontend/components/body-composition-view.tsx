"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Dumbbell, Plus, Scale, TrendingDown, TrendingUp, Waves } from "lucide-react";
import { useRouter } from "next/navigation";
import type { BodyCompositionData, BodyCompositionMeasurement } from "@/lib/types";
import { localIsoDate } from "@/lib/local-clock";

const fullDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

type MetricKey = "weight_kg" | "muscle_mass_kg" | "body_fat_percent";

const metrics: { key: MetricKey; label: string; unit: string; color: string; icon: typeof Scale }[] = [
  { key: "weight_kg", label: "Peso", unit: "kg", color: "#60a5fa", icon: Scale },
  { key: "muscle_mass_kg", label: "Masa muscular", unit: "kg", color: "#24f2ce", icon: Dumbbell },
  { key: "body_fat_percent", label: "Grasa corporal", unit: "%", color: "#f4b860", icon: Waves },
];

function delta(current: number, previous: number | undefined) {
  return previous == null ? null : Math.round((current - previous) * 10) / 10;
}

function TrendChart({ items, metric }: { items: BodyCompositionMeasurement[]; metric: typeof metrics[number] }) {
  const values = items.map((item) => item[metric.key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, metric.key === "body_fat_percent" ? 2 : 1);
  const lower = min - spread * 0.2;
  const upper = max + spread * 0.2;
  const x = (index: number) => items.length === 1 ? 160 : 18 + (index / (items.length - 1)) * 284;
  const y = (value: number) => 96 - ((value - lower) / (upper - lower)) * 72;
  const points = items.map((item, index) => `${x(index)},${y(item[metric.key])}`).join(" ");

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
          <circle key={item.id} cx={x(index)} cy={y(item[metric.key])} r="4" fill={metric.color} stroke="#07101f" strokeWidth="2">
            <title>{shortDate.format(new Date(`${item.measurement_date}T12:00:00`))}: {item[metric.key]} {metric.unit}</title>
          </circle>
        ))}
        <text x="18" y="114">{shortDate.format(new Date(`${items[0].measurement_date}T12:00:00`))}</text>
        {items.length > 1 && <text x="302" y="114" textAnchor="end">{shortDate.format(new Date(`${items.at(-1)!.measurement_date}T12:00:00`))}</text>}
      </svg>
    </article>
  );
}

export function BodyCompositionView({ data }: { data: BodyCompositionData }) {
  const router = useRouter();
  const [open, setOpen] = useState(data.count === 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const chronological = useMemo(() => [...data.measurements].reverse(), [data.measurements]);
  const latest = data.latest;
  const previous = data.measurements[1];

  async function saveMeasurement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      measurement_date: form.get("measurement_date"),
      source: "InBody",
      weight_kg: Number(form.get("weight_kg")),
      muscle_mass_kg: Number(form.get("muscle_mass_kg")),
      body_fat_percent: Number(form.get("body_fat_percent")),
      notes: String(form.get("notes") ?? ""),
    };
    try {
      const response = await fetch("/api/backend/body-composition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "No se pudo guardar la medición");
      setMessage("Medición guardada correctamente.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la medición");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="body-composition-layout">
      <section className="body-latest-panel" aria-label="Última medición corporal">
        <div className="body-panel-heading">
          <div>
            <span className="eyebrow">Última medición</span>
            <h2>{latest ? fullDate.format(new Date(`${latest.measurement_date}T12:00:00`)) : "Sin mediciones"}</h2>
          </div>
          <button className="primary-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            <Plus size={16} /> Nueva medición
          </button>
        </div>

        {open && (
          <form className="body-entry-form" onSubmit={saveMeasurement}>
            <label><span>Fecha</span><input name="measurement_date" type="date" required defaultValue={localIsoDate()} /></label>
            <label><span>Peso (kg)</span><input name="weight_kg" type="number" required min="30" max="250" step="0.1" /></label>
            <label><span>Masa muscular (kg)</span><input name="muscle_mass_kg" type="number" required min="5" max="120" step="0.1" /></label>
            <label><span>Grasa corporal (%)</span><input name="body_fat_percent" type="number" required min="1" max="75" step="0.1" /></label>
            <label className="body-notes"><span>Notas opcionales</span><input name="notes" type="text" maxLength={500} placeholder="Hora, hidratación o condiciones de la medición" /></label>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar medición"}</button>
          </form>
        )}
        {message && <p className="form-message" role="status">{message}</p>}

        {latest ? (
          <div className="body-latest-grid">
            {metrics.map((metric) => {
              const change = delta(latest[metric.key], previous?.[metric.key]);
              return (
                <article key={metric.key}>
                  <span className="body-metric-icon"><metric.icon size={19} /></span>
                  <div><small>{metric.label}</small><strong>{latest[metric.key].toFixed(1)} <b>{metric.unit}</b></strong></div>
                  <span className={change == null ? "body-delta neutral" : change > 0 ? "body-delta up" : change < 0 ? "body-delta down" : "body-delta neutral"}>
                    {change == null ? "Línea base" : <>{change > 0 ? <TrendingUp size={14} /> : change < 0 ? <TrendingDown size={14} /> : null}{change > 0 ? "+" : ""}{change} {metric.unit}</>}
                  </span>
                </article>
              );
            })}
          </div>
        ) : <p className="empty-row">Agrega tu primera medición para iniciar la línea base.</p>}
        <p className="body-context-note">Compara tendencias tomadas en condiciones parecidas. Hidratación, comida, ejercicio y hora del día pueden cambiar una lectura de bioimpedancia.</p>
      </section>

      {chronological.length > 0 && (
        <>
          <section className="body-trends-section" aria-label="Tendencias de composición corporal">
            <div className="section-heading"><div><span className="eyebrow">Progreso</span><h2>Evolución por medición</h2></div><span className="unit-label">{data.count} {data.count === 1 ? "registro" : "registros"}</span></div>
            <div className="body-trends-grid">{metrics.map((metric) => <TrendChart key={metric.key} items={chronological} metric={metric} />)}</div>
          </section>

          <section className="body-history-section">
            <div className="section-heading"><div><span className="eyebrow">Historial</span><h2>Todas las mediciones</h2></div></div>
            <div className="table-scroll"><table className="data-table body-history-table">
              <thead><tr><th>Fecha</th><th>Peso</th><th>Masa muscular</th><th>Grasa corporal</th><th>Fuente</th><th>Notas</th></tr></thead>
              <tbody>{data.measurements.map((item) => <tr key={item.id}>
                <td><strong>{fullDate.format(new Date(`${item.measurement_date}T12:00:00`))}</strong></td>
                <td>{item.weight_kg.toFixed(1)} kg</td><td>{item.muscle_mass_kg.toFixed(1)} kg</td><td>{item.body_fat_percent.toFixed(1)}%</td>
                <td>{item.source}</td><td>{item.notes || "—"}</td>
              </tr>)}</tbody>
            </table></div>
          </section>
        </>
      )}
    </div>
  );
}
