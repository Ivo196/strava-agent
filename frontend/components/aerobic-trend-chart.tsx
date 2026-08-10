"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
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
import { ArrowUpRight, Gauge, HeartPulse } from "lucide-react";
import type { RunProgressData } from "@/lib/types";

type AerobicPoint = RunProgressData["aerobic"]["points"][number];
type Metric = "pace" | "heartRate";
type ChartPoint = AerobicPoint & {
  axisKey: string;
  dateLabel: string;
};

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
const longDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });
const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

function formatPace(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const totalSeconds = Math.round(value * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPaceDelta(value?: number) {
  if (value === undefined || Math.abs(value) < 1) return "Sin cambio frente al bloque anterior";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(Math.round(value))} s/km · ${value > 0 ? "más lento" : "más rápido"}`;
}

function formatHeartRateDelta(value?: number) {
  if (value === undefined || Math.abs(value) < 1) return "Sin cambio frente al bloque anterior";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(Math.round(value))} bpm frente al bloque anterior`;
}

function metricValue(point: AerobicPoint, metric: Metric) {
  return metric === "pace" ? point.pace_min_km : point.average_heartrate;
}

function metricDomain(points: ChartPoint[], metric: Metric): [number, number] {
  const values = points.map((point) => metricValue(point, metric));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = metric === "pace" ? Math.max((maximum - minimum) * 0.16, 10 / 60) : Math.max((maximum - minimum) * 0.16, 4);
  return [minimum - padding, maximum + padding];
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}

function AerobicTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="runs-chart-tooltip aerobic-trend-tooltip">
      <span>{point.dateLabel} · {point.period === "recent" ? "últimas 6 semanas" : "bloque anterior"}</span>
      <strong>{formatPace(point.pace_min_km)} min/km</strong>
      <small>{point.average_heartrate} bpm · {oneDecimal.format(point.distance_km)} km</small>
    </div>
  );
}

function AerobicTrendDot({
  cx,
  cy,
  onSelect,
  payload,
  selectedId,
}: {
  cx?: number;
  cy?: number;
  onSelect: (id: string) => void;
  payload?: ChartPoint;
  selectedId: string;
}) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const selected = payload.id === selectedId;
  const label = `${payload.dateLabel}, ${formatPace(payload.pace_min_km)} minutos por kilómetro, ${payload.average_heartrate} pulsaciones por minuto`;

  return (
    <g>
      {selected && <circle className="aerobic-trend-dot-halo" cx={cx} cy={cy} r={14} />}
      <circle
        aria-label={label}
        className="aerobic-trend-hit"
        cx={cx}
        cy={cy}
        focusable="true"
        onClick={() => onSelect(payload.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(payload.id);
          }
        }}
        r={20}
        role="button"
        tabIndex={0}
      />
      <circle
        aria-hidden="true"
        className={`aerobic-trend-dot is-${payload.period}${selected ? " is-selected" : ""}`}
        cx={cx}
        cy={cy}
        r={selected ? 6 : 5}
      />
    </g>
  );
}

export function AerobicTrendChart({ aerobic }: { aerobic: RunProgressData["aerobic"] }) {
  const [metric, setMetric] = useState<Metric>("pace");
  const reducedMotion = useReducedMotion();
  const gradientId = `aerobicTrendFill-${useId().replaceAll(":", "")}`;
  const points = useMemo(() => aerobic.points
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point): ChartPoint => ({
      ...point,
      axisKey: point.id,
      dateLabel: shortDate.format(dateFromIso(point.date)),
    })), [aerobic.points]);
  const [selectedId, setSelectedId] = useState(() => points.at(-1)?.id ?? "");

  useEffect(() => {
    if (points.length && !points.some((point) => point.id === selectedId)) {
      setSelectedId(points.at(-1)?.id ?? "");
    }
  }, [points, selectedId]);

  const selected = points.find((point) => point.id === selectedId) ?? points.at(-1);
  const selectedGroup = aerobic.groups.find((group) => group.key === aerobic.selected_group);
  const firstRecent = points.find((point) => point.period === "recent");
  const domain = points.length ? metricDomain(points, metric) : [0, 1] as [number, number];
  const axisLabels = new Map(points.map((point) => [point.axisKey, point.dateLabel]));
  const paceDelta = aerobic.pace_change_seconds_km;
  const heartRateDelta = aerobic.heartrate_change_bpm;

  return (
    <section className="runs-analysis-panel aerobic-panel" aria-labelledby="aerobic-title">
      <header className="runs-panel-heading aerobic-panel-heading">
        <div>
          <span className="eyebrow">Carreras comparables</span>
          <h2 id="aerobic-title">Evolución de ritmo y pulso</h2>
          <p>Seguí cada carrera en orden temporal y compará el bloque reciente con el anterior.</p>
        </div>
        {selectedGroup && <span className="runs-comparison-chip">Distancias de {selectedGroup.label}</span>}
      </header>

      {aerobic.status === "insufficient" ? (
        <div className="runs-chart-empty">
          <HeartPulse aria-hidden="true" size={28} />
          <strong>Datos insuficientes para estimar tendencia.</strong>
          <p>{aerobic.detail}</p>
        </div>
      ) : (
        <>
          <div className="aerobic-summary-grid" aria-label="Comparación con el bloque anterior">
            <article>
              <span><Gauge aria-hidden="true" size={16} /> Ritmo medio · últimas 6 semanas</span>
              <strong>{formatPace(aerobic.current.pace_min_km)} <small>min/km</small></strong>
              <p className={paceDelta && paceDelta > 0 ? "is-caution" : ""}>{formatPaceDelta(paceDelta)}</p>
              <footer>Anterior: {formatPace(aerobic.previous.pace_min_km)} min/km</footer>
            </article>
            <article>
              <span><HeartPulse aria-hidden="true" size={16} /> Pulso medio · últimas 6 semanas</span>
              <strong>{aerobic.current.average_heartrate ?? "—"} <small>bpm</small></strong>
              <p>{formatHeartRateDelta(heartRateDelta)}</p>
              <footer>Anterior: {aerobic.previous.average_heartrate ?? "—"} bpm</footer>
            </article>
          </div>

          <div className="aerobic-chart-heading">
            <div>
              <span>Evolución cronológica</span>
              <strong>{metric === "pace" ? "Ritmo por carrera" : "Pulso medio por carrera"}</strong>
            </div>
            <div className="aerobic-metric-switch" aria-label="Métrica visible" role="group">
              <button
                aria-pressed={metric === "pace"}
                className={metric === "pace" ? "active" : ""}
                onClick={() => setMetric("pace")}
                type="button"
              >
                <Gauge aria-hidden="true" size={16} /> Ritmo
              </button>
              <button
                aria-pressed={metric === "heartRate"}
                className={metric === "heartRate" ? "active" : ""}
                onClick={() => setMetric("heartRate")}
                type="button"
              >
                <HeartPulse aria-hidden="true" size={16} /> Pulso
              </button>
            </div>
          </div>

          <div className="aerobic-visual-layout">
            <div
              aria-label={`Gráfico interactivo de ${metric === "pace" ? "ritmo" : "pulso"} por carrera. Seleccioná un punto para ver sus datos.`}
              className="aerobic-trend-chart"
              role="group"
            >
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart
                  accessibilityLayer
                  data={points}
                  margin={{ top: 28, right: 8, bottom: 4, left: 8 }}
                  onClick={(state) => {
                    const activeIndex = Number(state?.activeIndex);
                    const point = Number.isInteger(activeIndex) ? points[activeIndex] : undefined;
                    if (point) setSelectedId(point.id);
                  }}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--orange)" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="var(--orange)" stopOpacity={0.025} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,.16)" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="axisKey"
                    minTickGap={30}
                    padding={{ left: 8, right: 8 }}
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                    tickFormatter={(value: string) => axisLabels.get(value) ?? value}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    domain={domain}
                    orientation="right"
                    reversed={metric === "pace"}
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                    tickCount={4}
                    tickFormatter={(value: number) => metric === "pace" ? formatPace(value) : `${Math.round(value)} bpm`}
                    tickLine={false}
                    type="number"
                    width={62}
                  />
                  <Tooltip content={<AerobicTooltip />} cursor={false} />
                  {firstRecent && (
                    <ReferenceLine
                      label={{ value: "Últimas 6 semanas", position: "insideTopRight", fill: "#8f998e", fontSize: 9 }}
                      stroke="rgba(120,198,255,.36)"
                      strokeDasharray="4 5"
                      x={firstRecent.axisKey}
                    />
                  )}
                  {selected && (
                    <ReferenceLine
                      stroke="rgba(243,246,239,.76)"
                      strokeWidth={2}
                      x={selected.axisKey}
                    />
                  )}
                  <Area
                    activeDot={false}
                    animationDuration={240}
                    dataKey={metric === "pace" ? "pace_min_km" : "average_heartrate"}
                    dot={(props) => (
                      <AerobicTrendDot
                        {...props}
                        onSelect={setSelectedId}
                        selectedId={selectedId}
                      />
                    )}
                    fill={`url(#${gradientId})`}
                    fillOpacity={1}
                    isAnimationActive={!reducedMotion}
                    stroke="var(--orange)"
                    strokeWidth={3}
                    type="linear"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {selected && (
              <aside className="aerobic-selected-run" aria-live="polite">
                <header>
                  <span>Carrera seleccionada</span>
                  <strong>{longDate.format(dateFromIso(selected.date))}</strong>
                  <small>{selected.period === "recent" ? "Últimas 6 semanas" : "Bloque anterior"}</small>
                </header>
                <dl>
                  <div><dt>Distancia</dt><dd>{oneDecimal.format(selected.distance_km)} km</dd></div>
                  <div><dt>Ritmo</dt><dd>{formatPace(selected.pace_min_km)} min/km</dd></div>
                  <div><dt>Pulso</dt><dd>{selected.average_heartrate} bpm</dd></div>
                  <div><dt>Desnivel</dt><dd>{selected.elevation_gain_m} m</dd></div>
                </dl>
                <Link href={`/activities/${selected.id}`}>
                  Abrir carrera <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              </aside>
            )}
          </div>

          <footer className="aerobic-chart-footer">
            <div className="runs-chart-legend" aria-label="Períodos del gráfico">
              <span><i className="legend-previous" />Bloque anterior</span>
              <span><i className="legend-recent" />Últimas 6 semanas</span>
            </div>
            <small>{metric === "pace" ? "Más arriba significa un ritmo más rápido." : "Cada punto muestra el pulso medio de una carrera."}</small>
          </footer>

          <details className="runs-data-table">
            <summary>Ver carreras comparadas</summary>
            <div className="runs-data-table-scroll">
              <table>
                <thead><tr><th>Fecha</th><th>Período</th><th>Distancia</th><th>Ritmo</th><th>Pulso</th><th>Desnivel</th></tr></thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.id}>
                      <td>{point.dateLabel}</td>
                      <td>{point.period === "recent" ? "Últimas 6 semanas" : "Bloque anterior"}</td>
                      <td>{oneDecimal.format(point.distance_km)} km</td>
                      <td>{formatPace(point.pace_min_km)} min/km</td>
                      <td>{point.average_heartrate} bpm</td>
                      <td>{point.elevation_gain_m} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
