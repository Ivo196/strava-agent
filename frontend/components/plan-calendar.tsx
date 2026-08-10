"use client";

import {
  Bike,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  MoonStar,
  PersonStanding,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SessionCompletionCheck } from "@/components/session-completion-check";
import type {
  CalendarActualActivity,
  DailyAgendaItem,
  PlanCalendarDay,
} from "@/lib/types";

const dayMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
const weekdayShort = new Intl.DateTimeFormat("es-ES", { weekday: "short" });

function DayIcon({ category }: { category: DailyAgendaItem["category"] }) {
  if (category === "run") return <Footprints size={16} />;
  if (category === "strength") return <Gauge size={16} />;
  if (category === "bike") return <Bike size={16} />;
  return <MoonStar size={16} />;
}

function ActivityIcon({ activity }: { activity: CalendarActualActivity }) {
  if (activity.type === "RUNNING") return <Footprints size={14} />;
  if (activity.type === "BIKING") return <Bike size={14} />;
  if (activity.type === "WALKING" || activity.type === "HIKING") return <PersonStanding size={14} />;
  return <Sparkles size={14} />;
}

function groupWeeks(days: PlanCalendarDay[]) {
  return [...days]
    .sort((left, right) => left.date.localeCompare(right.date))
    .reduce<PlanCalendarDay[][]>((weeks, day) => {
      const current = weeks[weeks.length - 1];
      if (!current || current[0]?.week_number !== day.week_number) weeks.push([day]);
      else current.push(day);
      return weeks;
    }, []);
}

function activityDetails(activity: CalendarActualActivity) {
  const values: string[] = [];
  if (activity.distance_km) values.push(`${activity.distance_km} km`);
  if (activity.duration_minutes) values.push(`${activity.duration_minutes} min`);
  if (activity.calories) values.push(`${activity.calories} kcal`);
  return values.join(" · ");
}

function WeekBlock({
  week,
  current = false,
  onCompletion,
}: {
  week: PlanCalendarDay[];
  current?: boolean;
  onCompletion: (
    date: string,
    completion: Pick<DailyAgendaItem, "completed" | "completion_source" | "completion_locked">,
  ) => void;
}) {
  const [expanded, setExpanded] = useState(current);
  const activities = week.flatMap((day) => day.actual_activities ?? []);
  const completed = week.filter((day) => day.completed).length;
  const firstDay = week[0];
  const lastDay = week[week.length - 1];

  useEffect(() => {
    if (current) setExpanded(true);
  }, [current]);

  return (
    <details
      className={`calendar-week-v2${current ? " calendar-week-v2-current" : ""}`}
      id={current ? "semana-actual" : undefined}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      open={expanded}
    >
      <summary className="calendar-week-v2-head">
        <div className="calendar-week-v2-title">
          <span>{current ? "Semana actual" : `Semana ${week[0]?.week_number}`}</span>
          <strong>Semana {firstDay?.week_number} · {firstDay?.phase}</strong>
          <small>
            {weekdayShort.format(new Date(`${firstDay?.date}T12:00:00`))} {dayMonth.format(new Date(`${firstDay?.date}T12:00:00`))}
            {" — "}
            {weekdayShort.format(new Date(`${lastDay?.date}T12:00:00`))} {dayMonth.format(new Date(`${lastDay?.date}T12:00:00`))}
          </small>
        </div>
        <div className="calendar-week-summary">
          <b><CheckCircle2 size={13} /> {completed}/7</b>
          <ChevronDown aria-hidden="true" className="calendar-week-chevron" size={18} />
        </div>
      </summary>

      <div className="calendar-week-v2-body">
        <div className="calendar-days-v2">
          {week.map((item) => {
            const actualActivities = item.actual_activities ?? [];
            return (
            <article
              aria-label={`${item.day}: ${item.title}`}
              className={`calendar-day-v2 calendar-day-${item.category}${item.is_today ? " is-today" : ""}${item.completed ? " is-complete" : ""}${item.is_past ? " is-past" : ""}`}
              key={item.date}
            >
              <div className="calendar-day-v2-top">
                <div>
                  <span>{weekdayShort.format(new Date(`${item.date}T12:00:00`))}</span>
                  <strong>{new Date(`${item.date}T12:00:00`).getDate()}</strong>
                </div>
                <i><DayIcon category={item.category} /></i>
              </div>

              <div className="calendar-plan-copy">
                <small>{item.is_today ? "Hoy · Plan" : "Plan"}</small>
                <p>{item.title}</p>
                <span>{item.detail}</span>
              </div>

              <div className="calendar-day-reality">
                {actualActivities.length > 0 ? (
                  <>
                    <small>Realizado</small>
                    {actualActivities.map((activity, index) => (
                      <div className="calendar-actual-row" key={`${activity.type}-${activity.label}-${index}`}>
                        <i><ActivityIcon activity={activity} /></i>
                        <div>
                          <strong>{activity.label}</strong>
                          <span>{activityDetails(activity)}</span>
                        </div>
                      </div>
                    ))}
                  </>
                ) : item.is_past ? (
                  <span className="calendar-no-data">Sin actividad registrada</span>
                ) : (
                  <span className="calendar-no-data">Aún sin realizar</span>
                )}
              </div>

              {item.daily_metrics && (
                <div className="calendar-fitbit-metrics" aria-label="Resumen diario de Fitbit">
                  {item.daily_metrics.steps != null && <span><Footprints size={12} /> {item.daily_metrics.steps.toLocaleString("es-ES")}</span>}
                  {item.daily_metrics.active_minutes != null && <span><Clock3 size={12} /> {item.daily_metrics.active_minutes} min</span>}
                  {item.daily_metrics.active_energy_kcal != null && <span><Flame size={12} /> {item.daily_metrics.active_energy_kcal} kcal</span>}
                  {actualActivities.some((activity) => activity.average_heartrate) && (
                    <span><HeartPulse size={12} /> {Math.round(actualActivities.reduce((total, activity) => total + (activity.average_heartrate ?? 0), 0) / actualActivities.filter((activity) => activity.average_heartrate).length)} bpm</span>
                  )}
                </div>
              )}

              <SessionCompletionCheck
                compact
                date={item.date}
                initial={item}
                onChange={(completion) => onCompletion(item.date, completion)}
              />
            </article>
            );
          })}
        </div>
        {activities.length > 0 && (
          <p className="calendar-week-activity-note">{activities.length} {activities.length === 1 ? "actividad registrada" : "actividades registradas"} esta semana.</p>
        )}
      </div>
    </details>
  );
}

export function PlanCalendar({ days }: { days: PlanCalendarDay[] }) {
  const [items, setItems] = useState(days);

  useEffect(() => {
    setItems(days);
  }, [days]);

  const weeks = groupWeeks(items);

  function updateCompletion(
    date: string,
    completion: Pick<DailyAgendaItem, "completed" | "completion_source" | "completion_locked">,
  ) {
    setItems((currentItems) =>
      currentItems.map((item) => item.date === date ? { ...item, ...completion } : item),
    );
  }

  return (
    <div className="plan-calendar-v2">
      {weeks.map((week) => (
        <WeekBlock
          current={week.some((day) => day.is_current_week)}
          key={week[0]?.week_number}
          week={week}
          onCompletion={updateCompletion}
        />
      ))}
    </div>
  );
}
