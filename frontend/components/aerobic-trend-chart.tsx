"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { HeartPulse } from "lucide-react";
import type { RunProgressData } from "@/lib/types";

type AerobicPoint = RunProgressData["aerobic"]["points"][number];

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatPace(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const minutes = Math.floor(value);
  const seconds = Math.round((value - minutes) * 60);
  return `${minutes}:${String(seconds === 60 ? 0 : seconds).padStart(2, "0")}`;
}

function AerobicTooltip({ active, payload }: { active?: boolean; payload?: { payload: AerobicPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="runs-chart-tooltip">
      <span>{shortDate.format(new Date(`${point.date}T12:00:00`))} · {point.period === "recent" ? "bloque reciente" : "bloque anterior"}</span>
      <strong>{formatPace(point.pace_min_km)} min/km · {point.average_heartrate} bpm</strong>
      <small>{oneDecimal.format(point.distance_km)} km · {point.elevation_gain_m} m de desnivel</small>
    </div>
  );
}

export function AerobicTrendChart({ aerobic }: { aerobic: RunProgressData["aerobic"] }) {
  const recent = aerobic.points.filter((point) => point.period === "recent");
  const previous = aerobic.points.filter((point) => point.period === "previous");
  const selectedGroup = aerobic.groups.find((group) => group.key === aerobic.selected_group);

  return (
    <section className="runs-analysis-panel aerobic-panel" aria-labelledby="aerobic-title">
      <header className="runs-panel-heading">
        <div>
          <span className="eyebrow">Carreras comparables</span>
          <h2 id="aerobic-title">Ritmo y pulso</h2>
          <p>{aerobic.insight}</p>
        </div>
        {selectedGroup && <span className="runs-comparison-chip">{selectedGroup.label}</span>}
      </header>

      {aerobic.status === "insufficient" ? (
        <div className="runs-chart-empty">
          <HeartPulse aria-hidden="true" size={28} />
          <strong>Datos insuficientes para estimar tendencia.</strong>
          <p>{aerobic.detail}</p>
        </div>
      ) : (
        <>
          <div className="aerobic-comparison-strip" aria-label="Comparación de los bloques de seis semanas">
            <span><small>Bloque anterior</small><strong>{formatPace(aerobic.previous.pace_min_km)} <i>min/km</i></strong><em>{aerobic.previous.average_heartrate} bpm</em></span>
            <span><small>Últimas 6 semanas</small><strong>{formatPace(aerobic.current.pace_min_km)} <i>min/km</i></strong><em>{aerobic.current.average_heartrate} bpm</em></span>
          </div>
          <div
            className="runs-chart-frame aerobic-chart-frame"
            role="img"
            aria-label={`${aerobic.insight} ${aerobic.detail}`}
          >
            <ResponsiveContainer height="100%" width="100%">
              <ScatterChart margin={{ top: 18, right: 16, bottom: 10, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,.14)" strokeDasharray="3 5" />
                <XAxis
                  axisLine={false}
                  dataKey="average_heartrate"
                  domain={["dataMin - 4", "dataMax + 4"]}
                  name="Pulso"
                  tick={{ fill: "var(--muted)", fontSize: 10 }}
                  tickFormatter={(value: number) => `${value}`}
                  tickLine={false}
                  type="number"
                  unit=" bpm"
                />
                <YAxis
                  axisLine={false}
                  dataKey="pace_min_km"
                  domain={["dataMin - .12", "dataMax + .12"]}
                  name="Ritmo"
                  reversed
                  tick={{ fill: "var(--muted)", fontSize: 10 }}
                  tickFormatter={(value: number) => formatPace(value)}
                  tickLine={false}
                  type="number"
                  width={48}
                />
                <ZAxis dataKey="distance_km" range={[70, 170]} type="number" />
                <Tooltip content={<AerobicTooltip />} cursor={{ stroke: "rgba(120,198,255,.24)", strokeDasharray: "3 4" }} />
                <Scatter data={previous} fill="var(--viz-series-4)" isAnimationActive={false} name="Bloque anterior" stroke="var(--surface-alt)" strokeWidth={1.5} />
                <Scatter data={recent} fill="var(--orange-deep)" isAnimationActive={false} name="Últimas 6 semanas" stroke="var(--surface-alt)" strokeWidth={1.5} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="runs-chart-legend" aria-hidden="true">
            <span><i className="legend-previous" />Bloque anterior</span>
            <span><i className="legend-recent" />Últimas 6 semanas</span>
            <span>Más arriba = ritmo más rápido · tamaño = distancia</span>
          </div>
          <details className="runs-data-table">
            <summary>Ver carreras comparadas</summary>
            <table>
              <thead><tr><th>Fecha</th><th>Distancia</th><th>Ritmo</th><th>Pulso</th><th>Desnivel</th></tr></thead>
              <tbody>
                {aerobic.points.map((point) => (
                  <tr key={point.id}>
                    <td>{shortDate.format(new Date(`${point.date}T12:00:00`))}</td>
                    <td>{oneDecimal.format(point.distance_km)} km</td>
                    <td>{formatPace(point.pace_min_km)} min/km</td>
                    <td>{point.average_heartrate} bpm</td>
                    <td>{point.elevation_gain_m} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
