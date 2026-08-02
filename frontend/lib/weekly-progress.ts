import type { DashboardData } from "@/lib/types";

const dayMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function mondayFor(value: string) {
  const result = parseDate(value);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

export type WeeklyProgressSummary = {
  currentKm: number;
  targetKm: number;
  targetLabel: string;
  percent: number;
  remainingKm: number;
  runs: number;
  plannedRuns: number | null;
  previousKm: number | null;
  comparisonPercent: number | null;
  status: "not-started" | "building" | "close" | "complete";
  insight: string;
  rangeLabel: string;
  history: {
    week: string;
    label: string;
    distanceKm: number;
    heightPercent: number;
    isCurrent: boolean;
  }[];
};

export function getWeeklyProgress(data: DashboardData): WeeklyProgressSummary {
  const weekStart = mondayFor(data.current_date);
  const weekEnd = addDays(weekStart, 6);
  const currentKm = rounded(data.metrics.distance_current_week);
  const currentWeekPlan = data.next_week
    && data.next_week.start <= data.current_date
    && data.next_week.end >= data.current_date
    ? data.next_week
    : null;
  const agendaTarget = data.daily_agenda.find((item) => item.date === data.current_date)?.week_target_km;
  const plannedTarget = currentWeekPlan?.target_km || agendaTarget;
  const targetKm = rounded(plannedTarget || data.metrics.average_weekly_28d || Math.max(currentKm, 1));
  const targetLabel = plannedTarget ? "objetivo del plan" : "referencia de 28 días";
  const percent = Math.max(0, Math.min(100, Math.round((currentKm / targetKm) * 100)));
  const remainingKm = rounded(Math.max(targetKm - currentKm, 0));
  const previousWeek = isoDate(addDays(weekStart, -7));
  const previousPoint = data.weeks.find((item) => item.week === previousWeek);
  const previousKm = previousPoint ? rounded(previousPoint.distance_km) : null;
  const comparisonPercent = previousKm && previousKm > 0
    ? Math.round(((currentKm - previousKm) / previousKm) * 100)
    : null;
  const runs = data.metrics.runs_current_week;
  const plannedRuns = currentWeekPlan?.sessions.length || null;

  let status: WeeklyProgressSummary["status"] = "building";
  let insight = `Llevás ${currentKm} km en ${runs} ${runs === 1 ? "carrera" : "carreras"}. Te faltan ${remainingKm} km para cerrar el objetivo.`;
  if (currentKm === 0) {
    status = "not-started";
    insight = `La semana todavía no suma kilómetros. Tu referencia es ${targetKm} km.`;
  } else if (percent >= 100) {
    status = "complete";
    insight = plannedTarget
      ? `Objetivo semanal completado: ${currentKm} km en ${runs} ${runs === 1 ? "carrera" : "carreras"}.`
      : `Superaste tu referencia reciente: ${currentKm} km en ${runs} ${runs === 1 ? "carrera" : "carreras"}.`;
  } else if (percent >= 75) {
    status = "close";
    insight = `Estás cerca: te faltan ${remainingKm} km para completar el objetivo semanal.`;
  }

  const rawHistory = Array.from({ length: 4 }, (_, index) => {
    const date = addDays(weekStart, (index - 3) * 7);
    const week = isoDate(date);
    const point = data.weeks.find((item) => item.week === week);
    return {
      week,
      label: dayMonth.format(date).replace(".", ""),
      distanceKm: week === isoDate(weekStart) ? currentKm : rounded(point?.distance_km ?? 0),
      isCurrent: index === 3,
    };
  });
  const historyMax = Math.max(targetKm, ...rawHistory.map((item) => item.distanceKm), 1);

  return {
    currentKm,
    targetKm,
    targetLabel,
    percent,
    remainingKm,
    runs,
    plannedRuns,
    previousKm,
    comparisonPercent,
    status,
    insight,
    rangeLabel: `${dayMonth.format(weekStart)} — ${dayMonth.format(weekEnd)}`.replaceAll(".", ""),
    history: rawHistory.map((item) => ({
      ...item,
      heightPercent: item.distanceKm === 0 ? 3 : Math.max(10, Math.round((item.distanceKm / historyMax) * 100)),
    })),
  };
}
