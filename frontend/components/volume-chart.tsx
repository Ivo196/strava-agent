"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type WeekPoint = { week: string; distance_km: number; training_load: number; runs: number };

const shortDate = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

export function VolumeChart({ data }: { data: WeekPoint[] }) {
  const chartData = data.map((point) => ({
    ...point,
    label: shortDate.format(new Date(`${point.week}T12:00:00`)),
  }));

  if (!chartData.length) {
    return (
      <div className="chart-empty">
        <span className="empty-bars" aria-hidden="true" />
        <p>Tu evolución aparecerá cuando importes el historial.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={270}>
      <BarChart
        accessibilityLayer
        data={chartData}
        margin={{ top: 8, right: 4, bottom: 0, left: -20 }}
      >
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} unit=" km" />
        <Tooltip
          cursor={{ fill: "var(--soft-orange)" }}
          formatter={(value) => [`${value} km`, "Distancia"]}
          contentStyle={{ background: "var(--popover)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow)" }}
        />
        <Bar dataKey="distance_km" fill="var(--viz-series-1)" radius={[7, 7, 2, 2]} maxBarSize={34} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
