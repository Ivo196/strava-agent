"use client";

import { useRef, useState, type MouseEvent } from "react";
import type { ActivitySeriesPoint } from "@/lib/types";

type SeriesKey = "pace_min_km" | "heartrate" | "altitude_m";
type HoverPoint = {
  x: number;
  y: number;
  distance: number;
  value: number;
  label: string;
};

const chartMeta: Record<SeriesKey, { color: string; unit: string; reversed?: boolean; area?: boolean; formatter?: (value: number) => string }> = {
  pace_min_km: { color: "var(--viz-series-1)", unit: "min/km", reversed: true, formatter: paceLabel },
  heartrate: { color: "var(--viz-series-2)", unit: "bpm" },
  altitude_m: { color: "var(--viz-series-3)", unit: "m", area: true, formatter: (value) => `${Math.round(value)}` },
};

function paceLabel(value: number) {
  const minutes = Math.floor(value);
  const seconds = Math.round((value - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function pathFrom(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function SeriesChart({ data, dataKey }: { data: ActivitySeriesPoint[]; dataKey: SeriesKey }) {
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastHoverRef = useRef<HoverPoint | null>(null);
  const meta = chartMeta[dataKey];
  const samples = data.filter((point) => point[dataKey] != null);
  if (samples.length < 2) return <div className="chart-empty"><p>Sin muestras suficientes.</p></div>;

  const width = 680;
  const height = dataKey === "altitude_m" ? 210 : 250;
  const top = 22;
  const right = 18;
  const bottom = 36;
  const left = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const minDistance = Math.min(...samples.map((point) => point.distance_km));
  const maxDistance = Math.max(...samples.map((point) => point.distance_km));
  const values = samples.map((point) => Number(point[dataKey]));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = (maxValue - minValue || 1) * 0.12;
  const low = minValue - padding;
  const high = maxValue + padding;
  const valueRange = high - low || 1;
  const distanceRange = maxDistance - minDistance || 1;
  const points = samples.map((point) => {
    const value = Number(point[dataKey]);
    const ratio = (value - low) / valueRange;
    return {
      x: left + ((point.distance_km - minDistance) / distanceRange) * plotWidth,
      y: top + (meta.reversed ? ratio : 1 - ratio) * plotHeight,
      distance: point.distance_km,
      value,
      label: meta.formatter ? meta.formatter(value) : Math.round(value).toString(),
    };
  });
  const line = pathFrom(points);
  const fill = `${line} L ${left + plotWidth} ${top + plotHeight} L ${left} ${top + plotHeight} Z`;
  const ticks = [0, 0.5, 1].map((ratio) => {
    const value = low + (high - low) * (meta.reversed ? ratio : 1 - ratio);
    return { y: top + ratio * plotHeight, label: meta.formatter ? meta.formatter(value) : Math.round(value).toString() };
  });

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
        className="detail-svg-chart interactive-svg-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Evolución de ${dataKey}`}
        onMouseMove={updateHover}
        onMouseLeave={clearHover}
      >
        {ticks.map((tick) => (
          <g key={tick.y}>
            <path className="chart-grid-line" d={`M ${left} ${tick.y.toFixed(1)} H ${left + plotWidth}`} />
            <text className="chart-axis-label" x="2" y={tick.y + 4}>{tick.label}</text>
          </g>
        ))}
        {meta.area && <path className="detail-area-fill" d={fill} style={{ fill: meta.color }} />}
        <path className="detail-line detail-line-muted" d={line} style={{ stroke: meta.color }} />
        <path className="detail-line" d={line} style={{ stroke: meta.color }} />
        <circle className="chart-load-dot" cx={points[0].x} cy={points[0].y} r="3.5" />
        <circle className="chart-load-dot" cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3.5" />
        {hover && (
          <g className="chart-hover-layer">
            <path className="chart-hover-rule" d={`M ${hover.x.toFixed(1)} ${top} V ${top + plotHeight}`} />
            <circle className="chart-hover-dot" cx={hover.x} cy={hover.y} r="5.8" style={{ stroke: meta.color }} />
            <g transform={`translate(${Math.min(Math.max(hover.x + 12, left), width - right - 132)} ${hover.y < 78 ? hover.y + 18 : hover.y - 58})`}>
              <rect className="chart-tooltip-bg" width="124" height="46" rx="7" />
              <text className="chart-tooltip-title" x="10" y="17">{hover.distance.toFixed(2)} km</text>
              <text className="chart-tooltip-value" x="10" y="35">{hover.label} {meta.unit}</text>
            </g>
          </g>
        )}
        <rect className="chart-hit-area" x={left} y={top} width={plotWidth} height={plotHeight} />
        <text className="chart-x-label" x={left} y={height - 8}>{minDistance.toFixed(1)} km</text>
        <text className="chart-x-label" x={left + plotWidth} y={height - 8}>{maxDistance.toFixed(1)} km</text>
        <text className="chart-unit-label" x={left + plotWidth} y="14">{meta.unit}</text>
      </svg>
    </div>
  );
}

function HeartRateFallback({ average, max }: { average: number | null; max: number | null }) {
  if (!average && !max) return <div className="chart-empty"><p>Sin muestras suficientes.</p></div>;
  return (
    <div className="chart-empty heart-summary-fallback">
      <div className="heart-rate-summary">
        <div><span>Media</span><strong>{average ?? "—"}<small> bpm</small></strong></div>
        <div><span>Máxima</span><strong>{max ?? "—"}<small> bpm</small></strong></div>
        <div><span>Serie</span><strong>Resumen<small> workout</small></strong></div>
      </div>
      <p>Apple Health trajo pulso medio/máximo, pero no una curva de frecuencia cardíaca por segundo para graficar.</p>
    </div>
  );
}

export function ActivityDetailCharts({
  data,
  heartRateSummary,
}: {
  data: ActivitySeriesPoint[];
  heartRateSummary: { average: number | null; max: number | null };
}) {
  const hasHeartRateSeries = data.filter((point) => point.heartrate != null).length >= 2;
  return (
    <div className="activity-charts" aria-label="Evolución de la carrera por distancia">
      <section className="detail-chart panel">
        <div className="chart-title"><span className="eyebrow">Ritmo · min/km</span><strong>Evolución por distancia</strong></div>
        <SeriesChart data={data} dataKey="pace_min_km" />
      </section>

      <section className="detail-chart panel">
        <div className="chart-title"><span className="eyebrow">Frecuencia cardíaca</span><strong>Respuesta del esfuerzo</strong></div>
        {hasHeartRateSeries ? (
          <SeriesChart data={data} dataKey="heartrate" />
        ) : (
          <HeartRateFallback average={heartRateSummary.average} max={heartRateSummary.max} />
        )}
      </section>

      <section className="detail-chart detail-chart-wide panel">
        <div className="chart-title"><span className="eyebrow">Terreno</span><strong>Perfil de elevación</strong></div>
        <SeriesChart data={data} dataKey="altitude_m" />
      </section>
    </div>
  );
}
