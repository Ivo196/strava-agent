"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown } from "lucide-react";
import { isoWeekDetails } from "@/lib/iso-week";
import type { Activity, RunProgressData } from "@/lib/types";

type WeeklyPoint = RunProgressData["weekly"]["points"][number];
type Range = 4 | 8 | 12;
type Metric = "distance" | "time" | "elevation";
type ChartPoint = WeeklyPoint & {
  activities: Activity[];
  axisLabel: string;
  elevation_gain_m: number;
  moving_minutes: number;
  rangeLabel: string;
  weekNumber: number;
  weekYear: number;
};

const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wholeNumber = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const metricOptions: { key: Metric; label: string; dataKey: keyof ChartPoint }[] = [
  { key: "distance", label: "Distancia", dataKey: "distance_km" },
  { key: "time", label: "Tiempo", dataKey: "moving_minutes" },
  { key: "elevation", label: "Desnivel", dataKey: "elevation_gain_m" },
];

function formatDuration(value: number) {
  const minutes = Math.round(value);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

function metricValue(point: ChartPoint, metric: Metric) {
  if (metric === "time") return point.moving_minutes;
  if (metric === "elevation") return point.elevation_gain_m;
  return point.distance_km;
}

function formatMetric(value: number, metric: Metric) {
  if (metric === "time") return formatDuration(value);
  if (metric === "elevation") return `${wholeNumber.format(value)} m`;
  return `${oneDecimal.format(value)} km`;
}

function formatAxis(value: number, metric: Metric) {
  if (metric === "time") {
    if (value >= 60) return `${oneDecimal.format(value / 60)} h`;
    return `${wholeNumber.format(value)} min`;
  }
  if (metric === "elevation") return `${wholeNumber.format(value)} m`;
  return `${wholeNumber.format(value)} km`;
}

function selectedWeekFor(points: ChartPoint[]) {
  const current = points.find((point) => point.is_current);
  if (current?.runs) return current.week;
  return points.findLast((point) => point.runs > 0)?.week ?? current?.week ?? points.at(-1)?.week ?? "";
}

function WeeklyTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="runs-chart-tooltip weekly-progress-tooltip">
      <span>Semana {point.weekNumber} · {point.rangeLabel}</span>
      <strong>{oneDecimal.format(point.distance_km)} km</strong>
      <small>{formatDuration(point.moving_minutes)} · {wholeNumber.format(point.elevation_gain_m)} m</small>
      <small>{point.runs} {point.runs === 1 ? "carrera" : "carreras"}</small>
    </div>
  );
}

function WeeklyProgressDot({
  cx,
  cy,
  metric,
  onSelect,
  payload,
  selectedWeek,
}: {
  cx?: number;
  cy?: number;
  metric: Metric;
  onSelect: (week: string) => void;
  payload?: ChartPoint;
  selectedWeek: string;
}) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const selected = payload.week === selectedWeek;
  const label = `Semana ${payload.weekNumber}, ${formatMetric(metricValue(payload, metric), metric)}`;
  return (
    <g>
      {selected && <circle className="weekly-progress-dot-halo" cx={cx} cy={cy} r={13} />}
      <circle
        aria-label={label}
        className={`weekly-progress-dot${selected ? " is-selected" : ""}`}
        cx={cx}
        cy={cy}
        focusable="true"
        onClick={() => onSelect(payload.week)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(payload.week);
          }
        }}
        r={selected ? 6 : 5}
        role="button"
        tabIndex={0}
      />
    </g>
  );
}

export function WeeklyMileageChart({
  activities,
  progress,
}: {
  activities: Activity[];
  progress: RunProgressData;
}) {
  const [range, setRange] = useState<Range>(12);
  const [metric, setMetric] = useState<Metric>("distance");
  const activityTotals = useMemo(() => {
    const totals = new Map<string, { activities: Activity[]; elevation: number; minutes: number }>();
    activities.forEach((activity) => {
      if (progress.activity_quality[activity.id]?.duplicate_excluded) return;
      const key = isoWeekDetails(activity.date).key;
      const week = totals.get(key) ?? { activities: [], elevation: 0, minutes: 0 };
      week.activities.push(activity);
      week.elevation += activity.elevation_gain_m ?? 0;
      week.minutes += activity.moving_minutes ?? 0;
      totals.set(key, week);
    });
    return totals;
  }, [activities, progress.activity_quality]);

  const points = useMemo(() => progress.weekly.points.slice(-range).map((point): ChartPoint => {
    const details = isoWeekDetails(point.week);
    const totals = activityTotals.get(details.key);
    return {
      ...point,
      activities: totals?.activities ?? [],
      axisLabel: `S${details.weekNumber}`,
      elevation_gain_m: totals?.elevation ?? 0,
      moving_minutes: totals?.minutes ?? 0,
      rangeLabel: details.rangeLabel,
      weekNumber: details.weekNumber,
      weekYear: details.weekYear,
    };
  }), [activityTotals, progress.weekly.points, range]);

  const [selectedWeek, setSelectedWeek] = useState(() => selectedWeekFor(points));
  useEffect(() => {
    if (points.length && !points.some((point) => point.week === selectedWeek)) {
      setSelectedWeek(selectedWeekFor(points));
    }
  }, [points, selectedWeek]);

  const selected = points.find((point) => point.week === selectedWeek) ?? points.at(-1);
  const metricOption = metricOptions.find((option) => option.key === metric) ?? metricOptions[0];
  const historyTarget = selected ? `#history-${isoWeekDetails(selected.week).key}` : "#run-history-title";

  return (
    <section className="runs-analysis-panel weekly-mileage-panel" aria-labelledby="weekly-mileage-title">
      <h2 className="sr-only" id="weekly-mileage-title">Progreso semanal de carrera</h2>

      {selected && (
        <header className="weekly-progress-header" aria-live="polite">
          <div>
            <span>Semana {selected.weekNumber}</span>
            <strong>{selected.rangeLabel} {selected.weekYear}</strong>
          </div>
          <label className="weekly-week-picker">
            <span>Semana</span>
            <select value={selected.week} onChange={(event) => setSelectedWeek(event.target.value)}>
              {points.map((point) => (
                <option key={point.week} value={point.week}>
                  S{point.weekNumber} · {point.rangeLabel}{point.is_current ? " · actual" : ""}
                </option>
              ))}
            </select>
          </label>
        </header>
      )}

      {selected && (
        <div className="weekly-progress-metrics" aria-label="Métrica representada en el gráfico" role="group">
          {metricOptions.map((option) => (
            <button
              aria-pressed={metric === option.key}
              className={metric === option.key ? "active" : ""}
              key={option.key}
              onClick={() => setMetric(option.key)}
              type="button"
            >
              <small>{option.label}</small>
              <strong>{formatMetric(metricValue(selected, option.key), option.key)}</strong>
            </button>
          ))}
        </div>
      )}

      <div className="weekly-chart-heading">
        <span>Últimas {range} semanas</span>
        <div className="runs-range-switch" aria-label="Rango de semanas visible">
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
      </div>

      <div
        aria-label={`Gráfico interactivo de ${metricOption.label.toLowerCase()} durante ${range} semanas. Seleccioná un punto para actualizar el resumen.`}
        className="weekly-progress-chart"
        role="group"
      >
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart
            accessibilityLayer
            data={points}
            margin={{ top: 24, right: 8, bottom: 2, left: 8 }}
            onClick={(state) => {
              const activeIndex = Number(state?.activeIndex);
              const point = Number.isInteger(activeIndex) ? points[activeIndex] : undefined;
              if (point) setSelectedWeek(point.week);
            }}
          >
            <defs>
              <linearGradient id="weeklyProgressFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--orange)" stopOpacity={0.38} />
                <stop offset="100%" stopColor="var(--orange)" stopOpacity={0.07} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,.17)" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="axisLabel"
              interval={range === 12 ? 1 : 0}
              padding={{ left: 8, right: 8 }}
              tick={{ fill: "var(--muted)", fontSize: 10 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              orientation="right"
              tick={{ fill: "var(--muted)", fontSize: 10 }}
              tickCount={3}
              tickFormatter={(value: number) => formatAxis(value, metric)}
              tickLine={false}
              width={62}
            />
            <Tooltip content={<WeeklyTooltip />} cursor={false} />
            {selected && (
              <ReferenceLine
                stroke="rgba(243,246,239,.82)"
                strokeWidth={2}
                x={selected.axisLabel}
              />
            )}
            <Area
              activeDot={false}
              animationDuration={240}
              dataKey={metricOption.dataKey}
              dot={(props) => (
                <WeeklyProgressDot
                  {...props}
                  metric={metric}
                  onSelect={setSelectedWeek}
                  selectedWeek={selectedWeek}
                />
              )}
              fill="url(#weeklyProgressFill)"
              fillOpacity={1}
              isAnimationActive="auto"
              stroke="var(--orange)"
              strokeWidth={3}
              type="linear"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <footer className="weekly-progress-footer">
        <span>Seleccioná un punto para explorar otra semana.</span>
        {selected && selected.runs > 0 ? (
          <a href={historyTarget}>
            Ver {selected.runs} {selected.runs === 1 ? "carrera" : "carreras"} de la semana
            <ArrowDown aria-hidden="true" size={15} />
          </a>
        ) : (
          <small>Sin carreras registradas</small>
        )}
      </footer>

      <details className="runs-data-table">
        <summary>Ver datos por semana</summary>
        <div className="runs-data-table-scroll">
          <table>
            <thead><tr><th>Semana</th><th>Fechas</th><th>Distancia</th><th>Tiempo</th><th>Desnivel</th><th>Carreras</th></tr></thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.week}>
                  <td>Semana {point.weekNumber}{point.is_current ? " · actual" : ""}</td>
                  <td>{point.rangeLabel}</td>
                  <td>{oneDecimal.format(point.distance_km)} km</td>
                  <td>{formatDuration(point.moving_minutes)}</td>
                  <td>{wholeNumber.format(point.elevation_gain_m)} m</td>
                  <td>{point.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
