import type { DashboardData } from "@/lib/types";

export type RecoveryTone = "good" | "balanced" | "warning" | "bad" | "neutral";
export type RecoveryFactor = DashboardData["daily_state"]["morning_recovery"]["factors"][number];

export const RECOVERY_THRESHOLDS = {
  limited: 45,
  good: 70,
} as const;

export const ACTIVATION_THRESHOLDS = {
  moderate: 30,
  high: 65,
} as const;

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function recoveryTone(score: number | null): RecoveryTone {
  if (score == null) return "neutral";
  if (score >= RECOVERY_THRESHOLDS.good) return "good";
  if (score >= RECOVERY_THRESHOLDS.limited) return "balanced";
  return "bad";
}

export function activationTone(score: number | null): RecoveryTone {
  if (score == null) return "neutral";
  if (score < ACTIVATION_THRESHOLDS.moderate) return "good";
  if (score < ACTIVATION_THRESHOLDS.high) return "warning";
  return "bad";
}

export function activationLabel(score: number | null) {
  if (score == null) return "Sin lectura";
  if (score < ACTIVATION_THRESHOLDS.moderate) return "Baja";
  if (score < ACTIVATION_THRESHOLDS.high) return "Moderada";
  return "Alta";
}

export function loadTone(status: DashboardData["daily_state"]["load_7d"]["today_status"]): RecoveryTone {
  if (status === "Alta") return "bad";
  if (status === "Adecuada") return "good";
  return "balanced";
}

export function formatDuration(hours: number | null) {
  if (hours == null) return "—";
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${wholeHours} h ${minutes} min` : `${wholeHours} h`;
}

export function formatMetric(value: number | null, unit: string) {
  if (value == null) return "—";
  const digits = unit === "bpm" ? 0 : 1;
  return `${value.toLocaleString("es-ES", { maximumFractionDigits: digits })} ${unit}`;
}

export function dateLabel(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export function groupRecoveryFactors(factors: RecoveryFactor[]) {
  return {
    helping: factors.filter((factor) => factor.impact === "help"),
    braking: factors.filter((factor) => factor.impact === "brake"),
    neutral: factors.filter((factor) => factor.impact === "neutral"),
  };
}
