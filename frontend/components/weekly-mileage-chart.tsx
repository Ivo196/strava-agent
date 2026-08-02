"use client";

import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RunProgressData } from "@/lib/types";

type WeeklyPoint = RunProgressData["weekly"]["points"][number];
type Range = 4 | 8 | 12;

const weekLabel = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function WeeklyTooltip({ active, payload }: { active?: boolean; payload?: { payload: WeeklyPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="runs-chart-tooltip">
      <span>{point.is_current ? "Semana actual" : `Semana del ${weekLabel.format(new Date(`${point.week}T12:00:00`))}`}</span>
      <strong>{oneDecimal.format(point.distance_km)} km</strong>
      <small>{point.runs} {point.runs === 1 ? "carrera" : "carreras"} · tirada máxima {oneDecimal.format(point.longest_run_km)} km</small>
      {point.rolling_average_4 !== null && <small>Media móvil: {oneDecimal.format(point.rolling_average_4)} km</small>}
    </div>
  );
}

export function WeeklyMileageChart({ weekly }: { weekly: RunProgressData["weekly"] }) {
  const [range, setRange] = useState<Range>(8);
  const points = weekly.points.slice(-range);
  const interpretation = weekly.interpretations[String(range) as "4" | "8" | "12"];
  const currentWeek = points.find((point) => point.is_current)?.week;

  return (
    <section className="runs-analysis-panel weekly-mileage-panel" aria-labelledby="weekly-mileage-title">
      <header className="runs-panel-heading">
        <div>
          <span className="eyebrow">Carga externa</span>
          <h2 id="weekly-mileage-title">Volumen semanal</h2>
          <p>{interpretation.label}</p>
        </div>
        <div className="runs-range-switch" aria-label="Rango del volumen semanal">
          {([4, 8, 12] as const).map((option) => (
            <button
              aria-pressed={range === option}
              className={range === option ? "active" : ""}
              key={option}
              onClick={() => setRange(option)}
              type="button"
            >
              {option} sem
            </button>
          ))}
        </div>
      </header>

      <div
        className="runs-chart-frame"
        role="img"
        aria-label={`Kilómetros por semana durante ${range} semanas. ${interpretation.label}`}
      >
        <ResponsiveContainer height={292} width="100%">
          <ComposedChart data={points} margin={{ top: 20, right: 10, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(148,163,184,.14)" strokeDasharray="3 5" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="week"
              minTickGap={18}
              tick={{ fill: "var(--muted)", fontSize: 10 }}
              tickFormatter={(value: string) => weekLabel.format(new Date(`${value}T12:00:00`))}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--muted)", fontSize: 10 }}
              tickFormatter={(value: number) => `${value} km`}
              tickLine={false}
              width={54}
            />
            <Tooltip content={<WeeklyTooltip />} cursor={{ fill: "rgba(120,198,255,.05)" }} />
            {currentWeek && (
              <ReferenceLine
                label={{ value: "Actual", fill: "var(--orange-deep)", fontSize: 9, position: "insideTopRight" }}
                stroke="var(--orange-deep)"
                strokeDasharray="3 4"
                x={currentWeek}
              />
            )}
            <Bar dataKey="distance_km" maxBarSize={42} name="Kilómetros" radius={[5, 5, 1, 1]}>
              {points.map((point) => (
                <Cell
                  fill={point.is_current ? "var(--orange-deep)" : "var(--orange)"}
                  key={point.week}
                  stroke={point.is_current ? "var(--ink)" : "transparent"}
                  strokeDasharray={point.is_current ? "3 2" : undefined}
                  strokeWidth={point.is_current ? 1.5 : 0}
                />
              ))}
            </Bar>
            <Line
              connectNulls={false}
              dataKey="rolling_average_4"
              dot={{ fill: "var(--surface-alt)", r: 3, stroke: "var(--viz-series-3)", strokeWidth: 2 }}
              isAnimationActive
              name="Media móvil 4 sem"
              stroke="var(--viz-series-3)"
              strokeDasharray="6 5"
              strokeWidth={2.3}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="runs-chart-legend" aria-hidden="true">
        <span><i className="legend-week-volume" />Kilómetros semanales</span>
        <span><i className="legend-current-week" />Semana actual</span>
        <span><i className="legend-rolling" />Media móvil 4 sem</span>
      </div>
      <details className="runs-data-table">
        <summary>Ver datos del gráfico</summary>
        <table>
          <thead><tr><th>Semana</th><th>Kilómetros</th><th>Carreras</th><th>Media 4 sem</th></tr></thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.week}>
                <td>{point.is_current ? "Actual" : weekLabel.format(new Date(`${point.week}T12:00:00`))}</td>
                <td>{oneDecimal.format(point.distance_km)} km</td>
                <td>{point.runs}</td>
                <td>{point.rolling_average_4 === null ? "—" : `${oneDecimal.format(point.rolling_average_4)} km`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
