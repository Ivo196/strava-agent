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
        <div className="chart-title"><span className="eyebrow">Ritmo</span><strong>Cómo cambió tu pace</strong></div>
        <LineChart accessibilityLayer data={data} responsive style={{ width: "100%", height: 250 }} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="distance_km" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => `${Number(value).toFixed(1)} km`} tick={axis} axisLine={false} tickLine={false} />
          <YAxis dataKey="pace_min_km" domain={["dataMin - 0.2", "dataMax + 0.2"]} reversed tickFormatter={paceLabel} tick={axis} axisLine={false} tickLine={false} width={45} />
          <Tooltip labelFormatter={(value) => `${Number(value).toFixed(2)} km`} formatter={(value) => [`${paceLabel(Number(value))} /km`, "Ritmo"]} contentStyle={{ background: "#0b1119", border: "1px solid var(--line)", borderRadius: 10 }} />
          <Line type="monotone" dataKey="pace_min_km" stroke="var(--orange)" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </section>

      <section className="detail-chart panel">
        <div className="chart-title"><span className="eyebrow">Frecuencia cardíaca</span><strong>Respuesta del esfuerzo</strong></div>
        <LineChart accessibilityLayer data={data} responsive style={{ width: "100%", height: 250 }} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="distance_km" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => `${Number(value).toFixed(1)} km`} tick={axis} axisLine={false} tickLine={false} />
          <YAxis dataKey="heartrate" domain={["dataMin - 5", "dataMax + 5"]} tick={axis} axisLine={false} tickLine={false} width={45} unit="" />
          <Tooltip labelFormatter={(value) => `${Number(value).toFixed(2)} km`} formatter={(value) => [`${value} bpm`, "Pulso"]} contentStyle={{ background: "#0b1119", border: "1px solid var(--line)", borderRadius: 10 }} />
          <Line type="monotone" dataKey="heartrate" stroke="#6ff7dc" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </section>

      <section className="detail-chart detail-chart-wide panel">
        <div className="chart-title"><span className="eyebrow">Terreno</span><strong>Perfil de elevación</strong></div>
        <AreaChart accessibilityLayer data={data} responsive style={{ width: "100%", height: 210 }} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
          <defs><linearGradient id="altitude-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b8ff5a" stopOpacity={0.35} /><stop offset="100%" stopColor="#b8ff5a" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="distance_km" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => `${Number(value).toFixed(1)} km`} tick={axis} axisLine={false} tickLine={false} />
          <YAxis dataKey="altitude_m" domain={["dataMin - 3", "dataMax + 3"]} tickFormatter={(value) => `${Math.round(Number(value))} m`} tick={axis} axisLine={false} tickLine={false} width={48} />
          <Tooltip labelFormatter={(value) => `${Number(value).toFixed(2)} km`} formatter={(value) => [`${value} m`, "Altitud"]} contentStyle={{ background: "#0b1119", border: "1px solid var(--line)", borderRadius: 10 }} />
          <Area type="monotone" dataKey="altitude_m" stroke="#b8ff5a" fill="url(#altitude-fill)" strokeWidth={2} connectNulls />
        </AreaChart>
      </section>
    </div>
  );
}
