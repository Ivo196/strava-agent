"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Footprints, Route } from "lucide-react";
import { isoWeekDetails } from "@/lib/iso-week";
import type { RunProgressData } from "@/lib/types";

type WeeklyPoint = RunProgressData["weekly"]["points"][number];
type Range = 4 | 8 | 12;
type ChartPoint = WeeklyPoint & {
  axisLabel: string;
  rangeLabel: string;
  weekNumber: number;
  weekYear: number;
};

const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function enrichPoint(point: WeeklyPoint): ChartPoint {
  const details = isoWeekDetails(point.week);
  return {
    ...point,
    axisLabel: `S${details.weekNumber}`,
    rangeLabel: details.rangeLabel,
    weekNumber: details.weekNumber,
    weekYear: details.weekYear,
  };
}

function WeeklyTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="runs-chart-tooltip">
      <span>Semana {point.weekNumber} · {point.rangeLabel}</span>
      <strong>{oneDecimal.format(point.distance_km)} km</strong>
      <small>{point.runs} {point.runs === 1 ? "carrera" : "carreras"}</small>
      <small>Tirada más larga: {oneDecimal.format(point.longest_run_km)} km</small>
    </div>
  );
}

export function WeeklyMileageChart({ weekly }: { weekly: RunProgressData["weekly"] }) {
  const [range, setRange] = useState<Range>(8);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const points = useMemo(() => weekly.points.slice(-range).map(enrichPoint), [range, weekly.points]);
  const initialWeek = points.find((point) => point.is_current)?.week ?? points.at(-1)?.week ?? "";
  const [selectedWeek, setSelectedWeek] = useState(initialWeek);

  useEffect(() => {
    if (points.length && !points.some((point) => point.week === selectedWeek)) {
      setSelectedWeek(points.find((point) => point.is_current)?.week ?? points.at(-1)?.week ?? "");
    }
  }, [points, selectedWeek]);

  const selected = points.find((point) => point.week === selectedWeek) ?? points.at(-1);
  const currentWeek = points.find((point) => point.is_current)?.week;
  const chartWidth = Math.max(680, points.length * 86);

  useEffect(() => {
    const container = chartScrollRef.current;
    const selectedIndex = points.findIndex((point) => point.week === selected?.week);
    if (!container || selectedIndex < 0) return;
    const frame = window.requestAnimationFrame(() => {
      const availableScroll = container.scrollWidth - container.clientWidth;
      const position = points.length <= 1 ? 0 : (selectedIndex / (points.length - 1)) * availableScroll;
      container.scrollTo({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        left: position,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [points, selected?.week]);

  return (
    <section className="runs-analysis-panel weekly-mileage-panel" aria-labelledby="weekly-mileage-title">
      <header className="runs-panel-heading weekly-mileage-heading">
        <div>
          <span className="eyebrow">Semanas ISO · lunes a domingo</span>
          <h2 id="weekly-mileage-title">Kilómetros por semana</h2>
          <p>Seleccioná una barra o una semana para actualizar el resumen.</p>
        </div>
        <div className="runs-range-switch" aria-label="Rango de semanas visible">
          {([4, 8, 12] as const).map((option) => (
            <button
              aria-pressed={range === option}
              className={range === option ? "active" : ""}
              key={option}
              onClick={() => setRange(option)}
              type="button"
            >
              {option} semanas
            </button>
          ))}
        </div>
      </header>

      {selected && (
        <div className="weekly-selection" aria-live="polite">
          <div className="weekly-selection-title">
            <span>{selected.is_current ? "Semana actual" : `Semana ${selected.weekNumber}`}</span>
            <strong>Semana {selected.weekNumber}</strong>
            <small>{selected.rangeLabel} · {selected.weekYear}</small>
          </div>
          <div className="weekly-selection-metrics">
            <span><CalendarDays aria-hidden="true" size={16} /><small>Distancia</small><strong>{oneDecimal.format(selected.distance_km)} km</strong></span>
            <span><Footprints aria-hidden="true" size={16} /><small>Carreras</small><strong>{selected.runs}</strong></span>
            <span><Route aria-hidden="true" size={16} /><small>Tirada más larga</small><strong>{oneDecimal.format(selected.longest_run_km)} km</strong></span>
          </div>
          <label className="weekly-week-select">
            <span>Semana seleccionada</span>
            <select value={selected.week} onChange={(event) => setSelectedWeek(event.target.value)}>
              {points.map((point) => (
                <option key={point.week} value={point.week}>
                  Semana {point.weekNumber} · {point.rangeLabel}{point.is_current ? " · actual" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div
        className="weekly-chart-scroll"
        ref={chartScrollRef}
        role="img"
        aria-label={`Gráfico interactivo de kilómetros por semana durante ${range} semanas. La semana seleccionada se resume encima del gráfico.`}
      >
        <div className="runs-chart-frame weekly-chart-canvas" style={{ minWidth: `${chartWidth}px` }}>
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={points} margin={{ top: 32, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke="rgba(148,163,184,.11)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="axisLabel"
                interval={0}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tick={{ fill: "var(--muted)", fontSize: 9 }}
                tickFormatter={(value: number) => `${value} km`}
                tickLine={false}
                width={50}
              />
              <Tooltip content={<WeeklyTooltip />} cursor={{ fill: "rgba(120,198,255,.035)" }} />
              {currentWeek && (
                <ReferenceLine stroke="rgba(120,198,255,.42)" strokeDasharray="3 5" x={`S${isoWeekDetails(currentWeek).weekNumber}`} />
              )}
              <Bar
                activeBar={{ fill: "var(--orange-deep)", stroke: "var(--ink)", strokeWidth: 1 }}
                animationDuration={260}
                dataKey="distance_km"
                isAnimationActive="auto"
                maxBarSize={58}
                minPointSize={3}
                name="Kilómetros"
                onClick={(item) => {
                  const point = item.payload as ChartPoint | undefined;
                  if (point) setSelectedWeek(point.week);
                }}
                radius={[7, 7, 2, 2]}
              >
                <LabelList
                  dataKey="distance_km"
                  fill="var(--muted)"
                  fontSize={9}
                  formatter={(value: unknown) => `${oneDecimal.format(Number(value) || 0)} km`}
                  position="top"
                />
                {points.map((point) => {
                  const isSelected = point.week === selected?.week;
                  return (
                    <Cell
                      className="weekly-chart-bar"
                      cursor="pointer"
                      fill={isSelected ? "var(--orange)" : point.is_current ? "rgba(120,198,255,.52)" : "rgba(120,198,255,.2)"}
                      key={point.week}
                      stroke={isSelected ? "var(--ink)" : point.is_current ? "var(--orange)" : "rgba(120,198,255,.12)"}
                      strokeDasharray={point.is_current && !isSelected ? "4 3" : undefined}
                      strokeWidth={isSelected ? 2 : 1}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="weekly-chart-caption">
        <span><i />Semana seleccionada</span>
        <p>Las semanas sin carreras se mantienen para mostrar la continuidad real del entrenamiento.</p>
      </div>

      <details className="runs-data-table">
        <summary>Ver datos por semana</summary>
        <div className="runs-data-table-scroll">
          <table>
            <thead><tr><th>Semana</th><th>Fechas</th><th>Kilómetros</th><th>Carreras</th><th>Tirada más larga</th></tr></thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.week}>
                  <td>Semana {point.weekNumber}{point.is_current ? " · actual" : ""}</td>
                  <td>{point.rangeLabel}</td>
                  <td>{oneDecimal.format(point.distance_km)} km</td>
                  <td>{point.runs}</td>
                  <td>{oneDecimal.format(point.longest_run_km)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
