"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Clock3, Flame, Gauge, HeartPulse, Mountain } from "lucide-react";
import { isGenericAppleRun } from "@/lib/activity-display";
import { isoWeekDetails, parseLocalDate, startOfIsoWeek } from "@/lib/iso-week";
import type { Activity, RunProgressData } from "@/lib/types";

type HistoryRange = "4" | "8" | "12" | "all";
type HistoryGroup = {
  key: string;
  weekLabel: string;
  rangeLabel: string;
  activities: Activity[];
  calories: number;
  distance: number;
  elevation: number;
  isCurrent: boolean;
};

const filters: { key: HistoryRange; label: string }[] = [
  { key: "4", label: "4 semanas" },
  { key: "8", label: "8 semanas" },
  { key: "12", label: "12 semanas" },
  { key: "all", label: "Todo" },
];

const activityDate = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" });
const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function groupActivities(
  activities: Activity[],
  analysisDate: string,
  weeklyPoints: RunProgressData["weekly"]["points"],
): HistoryGroup[] {
  const currentWeek = isoWeekDetails(analysisDate);
  const canonicalDistance = new Map(
    weeklyPoints.map((point) => [isoWeekDetails(point.week).key, point.distance_km]),
  );
  const grouped = new Map<string, HistoryGroup>();

  activities.forEach((activity) => {
    const week = isoWeekDetails(activity.date);
    const isCurrent = week.key === currentWeek.key;
    const yearSuffix = week.weekYear === currentWeek.weekYear ? "" : ` · ${week.weekYear}`;
    const weekLabel = `Semana ${week.weekNumber}${isCurrent ? " · actual" : ""}`;
    const rangeLabel = `${week.rangeLabel}${yearSuffix}`;
    const existing = grouped.get(week.key) ?? {
      key: week.key,
      weekLabel,
      rangeLabel,
      activities: [],
      calories: 0,
      distance: 0,
      elevation: 0,
      isCurrent,
    };
    existing.activities.push(activity);
    existing.calories += activity.calories ?? 0;
    existing.distance += activity.distance_km;
    existing.elevation += activity.elevation_gain_m ?? 0;
    grouped.set(week.key, existing);
  });
  return [...grouped.values()].map((group) => ({
    ...group,
    distance: canonicalDistance.get(group.key) ?? group.distance,
  }));
}

function rangeActivities(activities: Activity[], analysisDate: string, range: HistoryRange) {
  if (range === "all") return activities;
  const today = parseLocalDate(analysisDate);
  const cutoff = startOfIsoWeek(today);
  cutoff.setDate(cutoff.getDate() - (Number(range) - 1) * 7);
  return activities.filter((activity) => {
    const activityDay = parseLocalDate(activity.date);
    return activityDay >= cutoff && activityDay <= today;
  });
}

function runTypeLabel(activity: Activity) {
  if (activity.sport_type === "TrailRun") return "Trail";
  if (activity.sport_type === "VirtualRun") return "Virtual";
  return null;
}

export function RunHistory({ activities, progress }: { activities: Activity[]; progress: RunProgressData }) {
  const [range, setRange] = useState<HistoryRange>("12");
  const visibleActivities = useMemo(
    () => rangeActivities(activities, progress.analysis_date, range),
    [activities, progress.analysis_date, range],
  );
  const groups = useMemo(
    () => groupActivities(visibleActivities, progress.analysis_date, progress.weekly.points),
    [progress.analysis_date, progress.weekly.points, visibleActivities],
  );

  return (
    <section className="run-history-section" aria-labelledby="run-history-title">
      <header className="run-history-heading">
        <div>
          <span className="eyebrow">El diario</span>
          <h2 id="run-history-title">Tus carreras, sin ruido</h2>
          <p>{visibleActivities.length} de {activities.length} salidas · agrupadas en {groups.length} {groups.length === 1 ? "semana" : "semanas"}</p>
        </div>
        <div className="history-filter-switch" aria-label="Filtrar historial por período">
          {filters.map((filter) => (
            <button
              aria-pressed={range === filter.key}
              className={range === filter.key ? "active" : ""}
              key={filter.key}
              onClick={() => setRange(filter.key)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      <details className="run-quality-method">
        <summary>Calidad y tratamiento de datos</summary>
        <p>
          Las actividades cortas, incompletas, sin pulso, con ritmo atípico o posible duplicado siguen visibles.
          Se excluyen solo de las tendencias donde podrían distorsionar la comparación; un posible duplicado no suma dos veces al volumen.
        </p>
      </details>

      {groups.length ? (
        <div className="run-history-groups">
          {groups.map((group) => {
            const maxDistance = Math.max(...group.activities.map((run) => run.distance_km), 1);
            return (
              <section className={`run-history-group${group.isCurrent ? " is-current" : ""}`} key={group.key} aria-labelledby={`history-${group.key}`}>
                <header className="run-history-week-header">
                  <div className="run-history-week-title">
                    <span>{group.weekLabel}</span>
                    <h3 id={`history-${group.key}`}>{group.rangeLabel}</h3>
                  </div>
                  <div className="run-history-week-summary">
                    <strong>{oneDecimal.format(group.distance)} <small>km</small></strong>
                    <span>{group.activities.length} {group.activities.length === 1 ? "salida" : "salidas"}</span>
                    {group.calories > 0 && <span>{Math.round(group.calories).toLocaleString("es-ES")} kcal</span>}
                  </div>
                </header>
                <div className="run-history-list">
                  {group.activities.map((activity, activityIndex) => {
                    const quality = progress.activity_quality[activity.id];
                    const runType = runTypeLabel(activity);
                    const meaningfulName = isGenericAppleRun(activity.name) ? null : activity.name.replace(/Apple Health/gi, "Apple Watch");
                    const distanceProgress = Math.max((activity.distance_km / maxDistance) * 100, 8);
                    const metrics = [
                      activity.moving_minutes ? { icon: Clock3, label: "Tiempo", tone: "time", value: `${activity.moving_minutes} min` } : null,
                      activity.pace && activity.pace !== "—" ? { icon: Gauge, label: "Ritmo", tone: "pace", value: activity.pace } : null,
                      activity.average_heartrate ? { icon: HeartPulse, label: "Pulso", tone: "heart", value: `${Math.round(activity.average_heartrate)} bpm` } : null,
                      activity.calories ? { icon: Flame, label: "Energía", tone: "energy", value: `${Math.round(activity.calories)} kcal` } : null,
                    ].filter((metric): metric is NonNullable<typeof metric> => metric !== null);
                    return (
                      <Link
                        aria-label={`Ver detalles de la carrera de ${oneDecimal.format(activity.distance_km)} km del ${activityDate.format(parseLocalDate(activity.date))}`}
                        className={`run-history-entry run-history-entry-tone-${activityIndex % 4}`}
                        href={`/activities/${activity.id}`}
                        key={activity.id}
                      >
                        <div className="run-history-card-top">
                          <div className="run-history-date">
                            <span>Salida {String(activityIndex + 1).padStart(2, "0")}</span>
                            <time dateTime={activity.date}>{activityDate.format(parseLocalDate(activity.date))}</time>
                          </div>
                          <span className="run-details-action" aria-hidden="true"><ArrowUpRight size={17} /></span>
                        </div>
                        <div className="run-history-distance">
                          <div><strong>{oneDecimal.format(activity.distance_km)}</strong><small>km</small></div>
                          <span aria-hidden="true" className="run-history-distance-bar"><i style={{ width: `${distanceProgress}%` }} /></span>
                          <div className="run-history-tags">
                            {meaningfulName && <span className="run-name-chip">{meaningfulName}</span>}
                            {runType && <span className="run-type-chip">{runType}</span>}
                            {activity.elevation_gain_m != null && activity.elevation_gain_m >= 10 && (
                              <span className="run-elevation-chip"><Mountain aria-hidden="true" size={11} /> {Math.round(activity.elevation_gain_m)} m</span>
                            )}
                            {quality?.flags.slice(0, 1).map((flag) => <span className="run-quality-chip" key={flag}>{flag}</span>)}
                            {quality && quality.flags.length > 1 && <span className="run-quality-more" title={quality.flags.join(", ")}>+{quality.flags.length - 1}</span>}
                          </div>
                        </div>
                        <div className="run-history-metrics">
                          {metrics.map(({ icon: Icon, label, tone, value }) => (
                            <span className={`run-history-metric run-history-metric-${tone}`} key={label}>
                              <Icon aria-hidden="true" size={16} /><small>{label}</small><strong>{value}</strong>
                            </span>
                          ))}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="run-history-empty">
          <strong>No hay carreras en este período.</strong>
          <p>Probá con un rango más amplio para volver al historial completo.</p>
        </div>
      )}
    </section>
  );
}
