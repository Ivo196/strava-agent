"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RunningDynamicsPoint } from "@/lib/types";

const axis = { fill: "var(--muted)", fontSize: 10 };
const tooltipStyle = {
  background: "var(--popover)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 10,
};

type MetricKey = Exclude<keyof RunningDynamicsPoint, "elapsed_min">;

const charts: {
  key: MetricKey;
  eyebrow: string;
  title: string;
  unit: string;
  color: string;
  digits?: number;
}[] = [
  { key: "power_w", eyebrow: "Potencia", title: "Producción de esfuerzo", unit: "W", color: "var(--viz-series-1)" },
  { key: "ground_contact_ms", eyebrow: "Contacto", title: "Tiempo sobre el suelo", unit: "ms", color: "var(--viz-series-2)" },
  { key: "stride_m", eyebrow: "Zancada", title: "Longitud por paso", unit: "m", color: "var(--viz-series-3)", digits: 2 },
  { key: "vertical_oscillation_cm", eyebrow: "Oscilación", title: "Movimiento vertical", unit: "cm", color: "var(--viz-series-4)", digits: 1 },
];

export function RunningDynamicsCharts({
  data,
  summary,
}: {
  data: RunningDynamicsPoint[];
  summary: Partial<Omit<RunningDynamicsPoint, "elapsed_min">>;
}) {
  const summaries = [
    ["Potencia", summary.power_w, "W"],
    ["Velocidad", summary.speed_kmh, "km/h"],
    ["Contacto", summary.ground_contact_ms, "ms"],
    ["Zancada", summary.stride_m, "m"],
    ["Oscilación", summary.vertical_oscillation_cm, "cm"],
  ] as const;

  return (
    <section className="dynamics-section">
      <div className="section-heading">
        <div><span className="eyebrow">Apple Watch</span><h2>Dinámica de carrera</h2></div>
        <span className="unit-label">promedios y evolución por minuto</span>
      </div>

      <div className="dynamics-summary" aria-label="Promedios de dinámica de carrera">
        {summaries.map(([label, value, unit]) => (
          <div key={label}><span>{label}</span><strong>{value ?? "—"}<small> {value == null ? "" : unit}</small></strong></div>
        ))}
      </div>

      <div className="dynamics-charts">
        {charts.map((chart) => (
          <article className="detail-chart panel" key={chart.key}>
            <div className="chart-title"><span className="eyebrow">{chart.eyebrow}</span><strong>{chart.title}</strong></div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart accessibilityLayer data={data} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="elapsed_min" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => `${Math.round(Number(value))}′`} tick={axis} axisLine={false} tickLine={false} />
                <YAxis dataKey={chart.key} domain={["auto", "auto"]} tickFormatter={(value) => Number(value).toFixed(chart.digits ?? 0)} tick={axis} axisLine={false} tickLine={false} width={46} />
                <Tooltip labelFormatter={(value) => `Minuto ${Math.round(Number(value))}`} formatter={(value) => [`${Number(value).toFixed(chart.digits ?? 0)} ${chart.unit}`, chart.eyebrow]} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey={chart.key} stroke={chart.color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </article>
        ))}
      </div>
    </section>
  );
}
