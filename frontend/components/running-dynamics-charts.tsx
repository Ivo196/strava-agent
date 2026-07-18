"use client";

import { useRef, useState, type MouseEvent } from "react";
import type { RunningDynamicsPoint } from "@/lib/types";

type MetricKey = Exclude<keyof RunningDynamicsPoint, "elapsed_min">;
type HoverPoint = {
  x: number;
  y: number;
  minute: number;
  value: number;
};

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

function pathFrom(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function DynamicsMiniChart({ data, chart }: { data: RunningDynamicsPoint[]; chart: (typeof charts)[number] }) {
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastHoverRef = useRef<HoverPoint | null>(null);
  const samples = data.filter((point) => point[chart.key] != null);
  if (samples.length < 2) return <div className="chart-empty"><p>Sin muestras suficientes.</p></div>;
  const width = 460;
  const height = 190;
  const top = 18;
  const right = 16;
  const bottom = 30;
  const left = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = samples.map((point) => Number(point[chart.key]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || 1) * 0.14;
  const low = min - padding;
  const high = max + padding;
  const range = high - low || 1;
  const minMinute = Math.min(...samples.map((point) => point.elapsed_min));
  const maxMinute = Math.max(...samples.map((point) => point.elapsed_min));
  const minuteRange = maxMinute - minMinute || 1;
  const points = samples.map((point) => ({
    x: left + ((point.elapsed_min - minMinute) / minuteRange) * plotWidth,
    y: top + plotHeight - ((Number(point[chart.key]) - low) / range) * plotHeight,
    minute: point.elapsed_min,
    value: Number(point[chart.key]),
  }));

  function updateHover(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const nearest = points.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best, points[0]);
    if (lastHoverRef.current === nearest) return;
    lastHoverRef.current = nearest;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      setHover(nearest);
      frameRef.current = null;
    });
  }

  function clearHover() {
    lastHoverRef.current = null;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setHover(null);
  }

  return (
    <div className="interactive-chart-frame">
      <svg
        className="detail-svg-chart dynamics-svg-chart interactive-svg-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={chart.title}
        onMouseMove={updateHover}
        onMouseLeave={clearHover}
      >
        <path className="chart-grid-line" d={`M ${left} ${top} H ${left + plotWidth} M ${left} ${top + plotHeight / 2} H ${left + plotWidth} M ${left} ${top + plotHeight} H ${left + plotWidth}`} />
        <path className="detail-line detail-line-muted" d={pathFrom(points)} style={{ stroke: chart.color }} />
        <path className="detail-line" d={pathFrom(points)} style={{ stroke: chart.color }} />
        {hover && (
          <g className="chart-hover-layer">
            <path className="chart-hover-rule" d={`M ${hover.x.toFixed(1)} ${top} V ${top + plotHeight}`} />
            <circle className="chart-hover-dot" cx={hover.x} cy={hover.y} r="5.4" style={{ stroke: chart.color }} />
            <g transform={`translate(${Math.min(Math.max(hover.x + 10, left), width - right - 112)} ${hover.y < 72 ? hover.y + 16 : hover.y - 54})`}>
              <rect className="chart-tooltip-bg" width="104" height="42" rx="7" />
              <text className="chart-tooltip-title" x="9" y="16">{hover.minute.toFixed(1)} min</text>
              <text className="chart-tooltip-value" x="9" y="32">{hover.value.toFixed(chart.digits ?? 0)} {chart.unit}</text>
            </g>
          </g>
        )}
        <rect className="chart-hit-area" x={left} y={top} width={plotWidth} height={plotHeight} />
        <text className="chart-axis-label" x="2" y={top + 4}>{high.toFixed(chart.digits ?? 0)}</text>
        <text className="chart-axis-label" x="2" y={top + plotHeight + 4}>{low.toFixed(chart.digits ?? 0)}</text>
        <text className="chart-x-label" x={left} y={height - 8}>{Math.round(minMinute)}′</text>
        <text className="chart-x-label" x={left + plotWidth} y={height - 8}>{Math.round(maxMinute)}′</text>
      </svg>
    </div>
  );
}

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
            <DynamicsMiniChart data={data} chart={chart} />
          </article>
        ))}
      </div>
    </section>
  );
}
