"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { ActivitySeriesPoint } from "@/lib/types";

const axis = { fill: "var(--muted)", fontSize: 10 };

function paceLabel(value: number) {
  const minutes = Math.floor(value);
  const seconds = Math.round((value - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ActivityDetailCharts({ data }: { data: ActivitySeriesPoint[] }) {
  return (
    <div className="activity-charts" aria-label="Evolución de la carrera por distancia">
      <section className="detail-chart panel">
        <div className="chart-title"><span className="eyebrow">Ritmo · min/km</span><strong>Evolución por distancia</strong></div>
        <LineChart accessibilityLayer data={data} responsive style={{ width: "100%", height: 250 }} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="distance_km" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => `${Number(value).toFixed(1)} km`} tick={axis} axisLine={false} tickLine={false} />
          <YAxis dataKey="pace_min_km" domain={["dataMin - 0.2", "dataMax + 0.2"]} reversed tickFormatter={paceLabel} tick={axis} axisLine={false} tickLine={false} width={45} />
          <Tooltip labelFormatter={(value) => `${Number(value).toFixed(2)} km`} formatter={(value) => [`${paceLabel(Number(value))} min/km`, "Ritmo"]} contentStyle={{ background: "var(--popover)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12 }} />
          <Line type="monotone" dataKey="pace_min_km" stroke="var(--viz-series-1)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />
        </LineChart>
      </section>

      <section className="detail-chart panel">
        <div className="chart-title"><span className="eyebrow">Frecuencia cardíaca</span><strong>Respuesta del esfuerzo</strong></div>
        <LineChart accessibilityLayer data={data} responsive style={{ width: "100%", height: 250 }} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="distance_km" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => `${Number(value).toFixed(1)} km`} tick={axis} axisLine={false} tickLine={false} />
          <YAxis dataKey="heartrate" domain={["dataMin - 5", "dataMax + 5"]} tick={axis} axisLine={false} tickLine={false} width={45} unit="" />
          <Tooltip labelFormatter={(value) => `${Number(value).toFixed(2)} km`} formatter={(value) => [`${value} bpm`, "Pulso"]} contentStyle={{ background: "var(--popover)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12 }} />
          <Line type="monotone" dataKey="heartrate" stroke="var(--viz-series-2)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />
        </LineChart>
      </section>

      <section className="detail-chart detail-chart-wide panel">
        <div className="chart-title"><span className="eyebrow">Terreno</span><strong>Perfil de elevación</strong></div>
        <AreaChart accessibilityLayer data={data} responsive style={{ width: "100%", height: 210 }} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
          <defs><linearGradient id="altitude-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--viz-series-1)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--viz-series-1)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="distance_km" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => `${Number(value).toFixed(1)} km`} tick={axis} axisLine={false} tickLine={false} />
          <YAxis dataKey="altitude_m" domain={["dataMin - 3", "dataMax + 3"]} tickFormatter={(value) => `${Math.round(Number(value))} m`} tick={axis} axisLine={false} tickLine={false} width={48} />
          <Tooltip labelFormatter={(value) => `${Number(value).toFixed(2)} km`} formatter={(value) => [`${value} m`, "Altitud"]} contentStyle={{ background: "var(--popover)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12 }} />
          <Area type="monotone" dataKey="altitude_m" stroke="var(--viz-series-1)" fill="url(#altitude-fill)" strokeWidth={2.5} connectNulls />
        </AreaChart>
      </section>
    </div>
  );
}
