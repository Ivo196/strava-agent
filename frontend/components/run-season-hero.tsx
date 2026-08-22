import Link from "next/link";
import { ArrowUpRight, CalendarRange, Flame, Footprints, Gauge, Route } from "lucide-react";
import { isoWeekDetails, parseLocalDate } from "@/lib/iso-week";
import type { Activity, RunProgressData } from "@/lib/types";

const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wholeNumber = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const runDate = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });

export function RunSeasonHero({ activities, progress }: { activities: Activity[]; progress: RunProgressData }) {
  const points = progress.weekly.points;
  const currentWeek = points.find((point) => point.is_current) ?? points.at(-1);
  const currentIndex = currentWeek ? points.findIndex((point) => point.week === currentWeek.week) : -1;
  const previousWeek = currentIndex > 0 ? points[currentIndex - 1] : undefined;
  const weekDelta = currentWeek && previousWeek ? currentWeek.distance_km - previousWeek.distance_km : null;
  const recentPoints = points.slice(-8);
  const maxWeek = Math.max(...recentPoints.map((point) => point.distance_km), 1);
  const latestRun = activities[0];

  return (
    <header className="run-season-hero">
      <div className="run-season-topline">
        <span><i /> PaceOS / diario de carrera</span>
        <time dateTime={progress.analysis_date}>Datos hasta el {runDate.format(parseLocalDate(progress.analysis_date))}</time>
      </div>

      <div className="run-season-main">
        <div className="run-season-intro">
          <span className="eyebrow">Camino a Chicago</span>
          <h1>Cada carrera<br /><em>cuenta.</em></h1>
          <p>Tu temporada completa, del pulso al ritmo. Leé la tendencia, celebrá el volumen y abrí cada salida para entenderla de verdad.</p>
          <div className="run-season-proof">
            <span><Footprints aria-hidden="true" size={15} /> {progress.lifetime.runs} carreras</span>
            <span><Route aria-hidden="true" size={15} /> {wholeNumber.format(progress.lifetime.distance_km)} km acumulados</span>
          </div>
        </div>

        <section className="run-season-week" aria-label="Resumen de la semana actual">
          <div className="run-season-week-heading">
            <span>Esta semana</span>
            <small>{currentWeek?.runs ?? 0} {(currentWeek?.runs ?? 0) === 1 ? "salida" : "salidas"}</small>
          </div>
          <strong>{oneDecimal.format(currentWeek?.distance_km ?? 0)}<small> km</small></strong>
          <p className={weekDelta !== null && weekDelta >= 0 ? "is-positive" : ""}>
            {weekDelta === null
              ? "Primera semana comparable"
              : `${weekDelta >= 0 ? "+" : ""}${oneDecimal.format(weekDelta)} km vs. la semana anterior`}
          </p>
          <div className="run-season-spark" aria-label="Volumen de las últimas ocho semanas">
            {recentPoints.map((point) => (
              <span className={point.is_current ? "is-current" : ""} key={point.week}>
                <i style={{ height: `${Math.max((point.distance_km / maxWeek) * 100, 5)}%` }} />
                <small>S{isoWeekDetails(point.week).weekNumber}</small>
              </span>
            ))}
          </div>
        </section>
      </div>

      <div className="run-season-strip">
        {latestRun ? (
          <Link className="run-season-latest" href={`/activities/${latestRun.id}`}>
            <span><CalendarRange aria-hidden="true" size={16} /> Última carrera</span>
            <strong>{oneDecimal.format(latestRun.distance_km)} km</strong>
            <small>{runDate.format(parseLocalDate(latestRun.date))}</small>
            <ArrowUpRight aria-hidden="true" size={18} />
          </Link>
        ) : null}
        <div>
          <span><Gauge aria-hidden="true" size={15} /> Último ritmo</span>
          <strong>{latestRun?.pace ?? "—"}</strong>
          <small>promedio por km</small>
        </div>
        <div>
          <span><Flame aria-hidden="true" size={15} /> Energía</span>
          <strong>{latestRun?.calories != null ? `${wholeNumber.format(latestRun.calories)} kcal` : "—"}</strong>
          <small>calorías activas</small>
        </div>
        <div>
          <span><Footprints aria-hidden="true" size={15} /> Continuidad</span>
          <strong>{progress.consistency.consecutive_active_weeks} sem</strong>
          <small>racha con actividad</small>
        </div>
      </div>
    </header>
  );
}
