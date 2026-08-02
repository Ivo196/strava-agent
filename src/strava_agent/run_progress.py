from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median, pstdev
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class RunProgressThresholds:
    """Configurable, deterministic rules used by every run-progress calculation."""

    short_distance_km: float = 1.5
    short_duration_minutes: float = 10.0
    minimum_trend_distance_km: float = 5.0
    minimum_trend_pace_min_km: float = 3.0
    maximum_trend_pace_min_km: float = 8.5
    minimum_trend_heartrate: float = 80.0
    maximum_trend_heartrate: float = 210.0
    maximum_elevation_per_km: float = 35.0
    duplicate_start_minutes: float = 20.0
    duplicate_distance_ratio: float = 0.08
    duplicate_duration_ratio: float = 0.10
    minimum_period_baseline_km: float = 3.0
    minimum_comparable_runs: int = 4
    maximum_comparable_terrain_delta_m_km: float = 7.0
    volume_growth_percent: float = 10.0
    volume_spike_percent: float = 35.0
    volume_decline_percent: float = -15.0
    weekly_spike_ratio: float = 1.40
    consistency_long_gap_days: int = 14
    long_run_minimum_km: float = 8.0
    long_run_stable_delta_km: float = 0.75
    long_run_spike_percent: float = 20.0
    long_run_spike_minimum_km: float = 2.0
    long_run_target_shortfall_ratio: float = 0.75


RUN_PROGRESS_THRESHOLDS = RunProgressThresholds()

DISTANCE_GROUPS = (
    ("5-8", "5–8 km", 5.0, 8.0),
    ("8-12", "8–12 km", 8.0, 12.0),
    ("12-plus", "12 km o más", 12.0, math.inf),
)

QUALITY_LABELS = {
    "short": "actividad corta",
    "incomplete": "datos incompletos",
    "duplicate": "posible duplicado",
    "outlier": "valor atípico",
    "walking": "posible caminata",
    "missing_hr": "sin pulso",
    "excluded": "excluida de tendencia",
}


def get_run_quality_flags(
    frame: pd.DataFrame,
    thresholds: RunProgressThresholds = RUN_PROGRESS_THRESHOLDS,
) -> dict[str, dict[str, Any]]:
    """Flag suspect activities without deleting or mutating the source history."""
    if frame.empty:
        return {}

    ordered = frame.sort_values(["start_date", "id"]).copy()
    internal: dict[str, dict[str, Any]] = {}
    for row in ordered.itertuples():
        activity_id = str(row.id)
        distance = _finite_or(float(row.distance_km), 0.0)
        duration = _finite_or(float(row.moving_minutes), 0.0)
        pace = _finite_or(float(row.pace_min_km), math.nan)
        heartrate = _finite_or(float(row.average_heartrate), math.nan)
        elevation_per_km = _finite_or(float(row.elevation_gain_m), 0.0) / distance if distance > 0 else 0.0
        codes: set[str] = set()

        if distance <= 0 or duration <= 0 or math.isnan(pace):
            codes.add("incomplete")
        if distance < thresholds.short_distance_km or duration < thresholds.short_duration_minutes:
            codes.add("short")
        if math.isnan(heartrate):
            codes.add("missing_hr")
        probable_walking = (
            not math.isnan(pace)
            and pace > thresholds.maximum_trend_pace_min_km
            and (math.isnan(heartrate) or heartrate < 135)
        )
        if probable_walking:
            codes.add("walking")
        if (
            (not math.isnan(pace) and (pace < thresholds.minimum_trend_pace_min_km or pace > 9.0))
            or (not math.isnan(heartrate) and (heartrate < 60 or heartrate > 220))
            or elevation_per_km > 50
        ):
            codes.add("outlier")

        internal[activity_id] = {
            "codes": codes,
            "duplicate_excluded": False,
            "volume_eligible": "incomplete" not in codes,
            "trend_eligible": False,
        }

    rows = list(ordered.itertuples())
    for index, first in enumerate(rows):
        for second in rows[index + 1 :]:
            if first.start_date.date() != second.start_date.date():
                if second.start_date.date() > first.start_date.date():
                    break
                continue
            start_delta = abs((second.start_date - first.start_date).total_seconds()) / 60
            if start_delta > thresholds.duplicate_start_minutes:
                continue
            if not _near(float(first.distance_km), float(second.distance_km), thresholds.duplicate_distance_ratio):
                continue
            if not _near(float(first.moving_minutes), float(second.moving_minutes), thresholds.duplicate_duration_ratio):
                continue
            first_id = str(first.id)
            second_id = str(second.id)
            internal[first_id]["codes"].add("duplicate")
            internal[second_id]["codes"].add("duplicate")
            internal[second_id]["duplicate_excluded"] = True
            internal[second_id]["volume_eligible"] = False

    output: dict[str, dict[str, Any]] = {}
    for row in ordered.itertuples():
        activity_id = str(row.id)
        item = internal[activity_id]
        codes = item["codes"]
        distance = _finite_or(float(row.distance_km), 0.0)
        pace = _finite_or(float(row.pace_min_km), math.nan)
        heartrate = _finite_or(float(row.average_heartrate), math.nan)
        elevation_per_km = _finite_or(float(row.elevation_gain_m), 0.0) / distance if distance > 0 else math.inf
        trend_eligible = (
            item["volume_eligible"]
            and not item["duplicate_excluded"]
            and "short" not in codes
            and "outlier" not in codes
            and "walking" not in codes
            and distance >= thresholds.minimum_trend_distance_km
            and not math.isnan(pace)
            and thresholds.minimum_trend_pace_min_km <= pace <= thresholds.maximum_trend_pace_min_km
            and not math.isnan(heartrate)
            and thresholds.minimum_trend_heartrate <= heartrate <= thresholds.maximum_trend_heartrate
            and elevation_per_km <= thresholds.maximum_elevation_per_km
        )
        if not trend_eligible:
            codes.add("excluded")
        item["trend_eligible"] = trend_eligible
        output[activity_id] = {
            "flags": [QUALITY_LABELS[code] for code in QUALITY_LABELS if code in codes],
            "excluded_from_trend": not trend_eligible,
            "volume_eligible": bool(item["volume_eligible"]),
            "duplicate_excluded": bool(item["duplicate_excluded"]),
        }
    return output


def get_period_summary(
    frame: pd.DataFrame,
    quality: dict[str, dict[str, Any]],
    *,
    today: date,
    days: int,
    thresholds: RunProgressThresholds = RUN_PROGRESS_THRESHOLDS,
) -> dict[str, Any]:
    current_start = today - timedelta(days=days - 1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)
    current = _between_dates(_volume_frame(frame, quality), current_start, today)
    previous = _between_dates(_volume_frame(frame, quality), previous_start, previous_end)
    current_metrics = _aggregate_period(current)
    previous_metrics = _aggregate_period(previous)
    comparable = _period_comparable(frame, quality, current_start, today, previous_start, previous_end)
    current_metrics.update(comparable["current"])
    previous_metrics.update(comparable["previous"])
    return {
        "days": days,
        "current": current_metrics,
        "previous": previous_metrics,
        "distance_change_percent": _safe_percent_change(
            current_metrics["distance_km"], previous_metrics["distance_km"], thresholds.minimum_period_baseline_km
        ),
        "runs_change_percent": _safe_percent_change(current_metrics["runs"], previous_metrics["runs"], 1),
        "comparable_group": comparable["group"],
        "comparison_note": comparable["note"],
    }


def get_weekly_mileage(
    frame: pd.DataFrame,
    quality: dict[str, dict[str, Any]],
    *,
    today: date,
    weeks: int = 12,
    thresholds: RunProgressThresholds = RUN_PROGRESS_THRESHOLDS,
) -> dict[str, Any]:
    current_week = today - timedelta(days=today.weekday())
    start_week = current_week - timedelta(weeks=weeks - 1)
    volume = _volume_frame(frame, quality)
    points: list[dict[str, Any]] = []
    for offset in range(weeks):
        week_start = start_week + timedelta(weeks=offset)
        week_end = min(week_start + timedelta(days=6), today)
        subset = _between_dates(volume, week_start, week_end)
        point = {
            "week": week_start.isoformat(),
            "distance_km": round(float(subset["distance_km"].sum()), 1) if not subset.empty else 0.0,
            "runs": int(len(subset)),
            "longest_run_km": round(float(subset["distance_km"].max()), 1) if not subset.empty else 0.0,
            "rolling_average_4": None,
            "is_current": week_start == current_week,
        }
        points.append(point)
        if len(points) >= 4:
            point["rolling_average_4"] = round(
                sum(float(item["distance_km"]) for item in points[-4:]) / 4, 1
            )
    return {
        "points": points,
        "interpretations": {
            str(span): _weekly_interpretation(points[-span:], thresholds) for span in (4, 8, 12)
        },
    }


def get_consistency_status(
    frame: pd.DataFrame,
    quality: dict[str, dict[str, Any]],
    *,
    today: date,
    plan_adherence_percent: float | None = None,
    thresholds: RunProgressThresholds = RUN_PROGRESS_THRESHOLDS,
) -> dict[str, Any]:
    eligible_ids = {
        activity_id
        for activity_id, item in quality.items()
        if item["volume_eligible"] and "actividad corta" not in item["flags"]
    }
    eligible = frame[frame["id"].astype(str).isin(eligible_ids)].copy()
    recent = _between_dates(eligible, today - timedelta(days=27), today)
    if len(recent) < 3:
        return {
            "status": "insufficient",
            "message": "Datos insuficientes para evaluar la consistencia.",
            "runs_per_week": round(len(recent) / 4, 1),
            "active_weeks": 0,
            "consecutive_active_weeks": 0,
            "longest_gap_days": None,
            "plan_adherence_percent": plan_adherence_percent,
        }

    current_week = today - timedelta(days=today.weekday())
    week_starts = [current_week - timedelta(weeks=offset) for offset in reversed(range(8))]
    counts = []
    for week_start in week_starts:
        subset = _between_dates(eligible, week_start, min(week_start + timedelta(days=6), today))
        counts.append(int(len(subset)))
    recent_counts = counts[-4:]
    active_weeks = sum(count > 0 for count in recent_counts)
    streak = 0
    for offset, count in enumerate(reversed(counts)):
        if count <= 0:
            if offset == 0 and today.weekday() < 6:
                continue
            break
        streak += 1
    dates = sorted(set(recent["start_date"].dt.date.tolist()))
    gap_values = [(right - left).days for left, right in zip(dates, dates[1:])]
    if dates:
        gap_values.append((today - dates[-1]).days)
    longest_gap = max(gap_values, default=0)
    average_count = sum(recent_counts) / 4
    variation = pstdev(recent_counts) / average_count if average_count else math.inf
    last_two = sum(counts[-2:])
    prior_two = sum(counts[-4:-2])

    if last_two >= prior_two + 2 and active_weeks >= 2:
        status = "recovering"
        message = "Volviendo al ritmo: aumentaste la frecuencia en las últimas dos semanas."
    elif streak >= 3 and longest_gap < thresholds.consistency_long_gap_days and variation <= 0.75:
        status = "good"
        message = f"Buena consistencia: {streak} semanas activas seguidas."
    elif longest_gap >= thresholds.consistency_long_gap_days or active_weeks <= 2:
        status = "irregular"
        message = "Entrenamiento irregular: hubo pausas largas entre sesiones."
    else:
        status = "steady"
        message = f"Consistencia estable: {active_weeks} de las últimas 4 semanas tuvieron carreras."

    if plan_adherence_percent is not None and plan_adherence_percent >= 75 and status == "steady":
        status = "good"
        message = "Buena consistencia reciente y cumplimiento del plan en línea con lo previsto."

    return {
        "status": status,
        "message": message,
        "runs_per_week": round(len(recent) / 4, 1),
        "active_weeks": active_weeks,
        "consecutive_active_weeks": streak,
        "longest_gap_days": longest_gap,
        "plan_adherence_percent": plan_adherence_percent,
    }


def get_aerobic_efficiency_trend(
    frame: pd.DataFrame,
    quality: dict[str, dict[str, Any]],
    *,
    today: date,
    thresholds: RunProgressThresholds = RUN_PROGRESS_THRESHOLDS,
) -> dict[str, Any]:
    trend_ids = {activity_id for activity_id, item in quality.items() if not item["excluded_from_trend"]}
    start = today - timedelta(weeks=12) + timedelta(days=1)
    pivot = today - timedelta(weeks=6) + timedelta(days=1)
    candidates = _between_dates(frame[frame["id"].astype(str).isin(trend_ids)], start, today).copy()
    groups: list[dict[str, Any]] = []
    selected: dict[str, Any] | None = None

    for key, label, minimum, maximum in DISTANCE_GROUPS:
        group = candidates[(candidates["distance_km"] >= minimum) & (candidates["distance_km"] < maximum)].copy()
        previous = group[group["start_date"].dt.date < pivot]
        recent = group[group["start_date"].dt.date >= pivot]
        terrain_delta = None
        if not previous.empty and not recent.empty:
            previous_terrain = median((previous["elevation_gain_m"] / previous["distance_km"]).tolist())
            recent_terrain = median((recent["elevation_gain_m"] / recent["distance_km"]).tolist())
            terrain_delta = abs(recent_terrain - previous_terrain)
        comparable = (
            len(group) >= thresholds.minimum_comparable_runs
            and len(previous) >= 2
            and len(recent) >= 2
            and terrain_delta is not None
            and terrain_delta <= thresholds.maximum_comparable_terrain_delta_m_km
        )
        descriptor = {
            "key": key,
            "label": label,
            "count": int(len(group)),
            "recent_count": int(len(recent)),
            "previous_count": int(len(previous)),
            "comparable": comparable,
        }
        groups.append(descriptor)
        if comparable and (selected is None or len(group) > selected["count"]):
            selected = {**descriptor, "frame": group, "previous": previous, "recent": recent}

    if selected is None:
        return {
            "status": "insufficient",
            "insight": "No hay suficientes carreras comparables.",
            "detail": "Se necesitan al menos cuatro carreras del mismo rango, con pulso y terreno similares.",
            "selected_group": None,
            "groups": groups,
            "current": {"pace_min_km": None, "average_heartrate": None},
            "previous": {"pace_min_km": None, "average_heartrate": None},
            "points": [],
        }

    previous_pace = median(selected["previous"]["pace_min_km"].tolist())
    recent_pace = median(selected["recent"]["pace_min_km"].tolist())
    previous_hr = median(selected["previous"]["average_heartrate"].tolist())
    recent_hr = median(selected["recent"]["average_heartrate"].tolist())
    pace_delta = recent_pace - previous_pace
    hr_delta = recent_hr - previous_hr
    previous_efficiency = (1000 / previous_pace) / previous_hr
    recent_efficiency = (1000 / recent_pace) / recent_hr
    efficiency_change = (recent_efficiency / previous_efficiency - 1) * 100

    if abs(pace_delta) <= 0.15 and hr_delta <= -3:
        status, insight = "improving", "Ritmo similar con menor pulso."
    elif pace_delta <= -0.12 and abs(hr_delta) <= 4:
        status, insight = "improving", "Más rápido con esfuerzo parecido."
    elif hr_delta >= 5 and pace_delta >= -0.12:
        status, insight = "higher_effort", "Pulso más alto en carreras recientes."
    elif efficiency_change >= 2.5:
        status, insight = "improving", "Mejor relación entre ritmo y pulso."
    elif pace_delta > 0.18 and hr_delta <= -3:
        status, insight = "stable", "Pulso más bajo, con un ritmo reciente más tranquilo."
    else:
        status, insight = "stable", "Tendencia estable."

    selected_frame = selected["frame"].sort_values("start_date")
    points = [
        {
            "id": str(row.id),
            "date": row.start_date.date().isoformat(),
            "distance_km": round(float(row.distance_km), 1),
            "pace_min_km": round(float(row.pace_min_km), 3),
            "average_heartrate": round(float(row.average_heartrate)),
            "elevation_gain_m": round(float(row.elevation_gain_m)),
            "period": "recent" if row.start_date.date() >= pivot else "previous",
        }
        for row in selected_frame.itertuples()
    ]
    return {
        "status": status,
        "insight": insight,
        "detail": f"Compara {selected['count']} carreras de {selected['label']} en dos bloques de seis semanas.",
        "selected_group": selected["key"],
        "groups": groups,
        "current": {
            "pace_min_km": round(recent_pace, 3),
            "average_heartrate": round(recent_hr),
        },
        "previous": {
            "pace_min_km": round(previous_pace, 3),
            "average_heartrate": round(previous_hr),
        },
        "pace_change_seconds_km": round(pace_delta * 60),
        "heartrate_change_bpm": round(hr_delta),
        "efficiency_change_percent": round(efficiency_change, 1),
        "points": points,
    }


def get_long_run_progression(
    frame: pd.DataFrame,
    quality: dict[str, dict[str, Any]],
    *,
    today: date,
    planned_target_km: float | None = None,
    thresholds: RunProgressThresholds = RUN_PROGRESS_THRESHOLDS,
) -> dict[str, Any]:
    volume = _volume_frame(frame, quality)
    usable = volume[(volume["distance_km"] >= 3) & (volume["pace_min_km"] <= 9.0)]
    recent = _between_dates(usable, today - timedelta(days=27), today)
    twelve_weeks = _between_dates(usable, today - timedelta(weeks=12) + timedelta(days=1), today)
    current_week = today - timedelta(days=today.weekday())
    weekly: list[dict[str, Any]] = []
    for offset in reversed(range(12)):
        week_start = current_week - timedelta(weeks=offset)
        subset = _between_dates(usable, week_start, min(week_start + timedelta(days=6), today))
        if not subset.empty:
            weekly.append({"week": week_start.isoformat(), "distance_km": round(float(subset["distance_km"].max()), 1)})

    latest = weekly[-1]["distance_km"] if weekly else 0.0
    previous = weekly[-2]["distance_km"] if len(weekly) >= 2 else None
    change = round(latest - previous, 1) if previous is not None else None
    warning = False
    if previous and change is not None:
        warning = (
            change >= thresholds.long_run_spike_minimum_km
            and change / previous * 100 > thresholds.long_run_spike_percent
        )

    if not weekly or max((item["distance_km"] for item in weekly[-4:]), default=0) < thresholds.long_run_minimum_km:
        status = "missing"
        message = "Todavía no hay una tirada larga reciente."
    elif warning:
        status = "spike"
        message = "El aumento semanal fue elevado; revisá el plan antes de seguir subiendo."
    elif change is None or abs(change) <= thresholds.long_run_stable_delta_km:
        status = "stable"
        message = "La tirada larga se mantiene estable."
    elif change > 0:
        status = "growing"
        message = f"La tirada larga aumentó {_decimal_es(abs(change))} km respecto de la anterior."
    else:
        status = "lower"
        message = f"La tirada larga reciente fue {_decimal_es(abs(change))} km menor que la anterior."

    recent_longest = float(recent["distance_km"].max()) if not recent.empty else 0.0
    maximum_12_weeks = float(twelve_weeks["distance_km"].max()) if not twelve_weeks.empty else 0.0
    progress_percent = None
    if planned_target_km and planned_target_km > 0:
        progress_percent = min(round(recent_longest / planned_target_km * 100), 100)
    return {
        "status": status,
        "message": message,
        "recent_km": round(recent_longest, 1),
        "maximum_12_weeks_km": round(maximum_12_weeks, 1),
        "latest_week_km": latest,
        "previous_week_km": previous,
        "change_km": change,
        "planned_target_km": round(planned_target_km, 1) if planned_target_km else None,
        "target_progress_percent": progress_percent,
        "progression_warning": warning,
        "weekly": weekly,
    }


def get_training_summary(
    *,
    period_28: dict[str, Any],
    consistency: dict[str, Any],
    aerobic: dict[str, Any],
    long_run: dict[str, Any],
    weekly: dict[str, Any],
    planned_runs_per_week: int | None = None,
    thresholds: RunProgressThresholds = RUN_PROGRESS_THRESHOLDS,
) -> dict[str, str]:
    current = period_28["current"]
    previous = period_28["previous"]
    distance_change = period_28["distance_change_percent"]
    eight_week_interpretation = weekly["interpretations"]["8"]["status"]

    if current["runs"] < 3:
        state = "Datos insuficientes"
    elif (
        distance_change is not None and distance_change > thresholds.volume_spike_percent
    ) or eight_week_interpretation == "spike":
        state = "Volumen creciendo demasiado rápido"
    elif aerobic["status"] == "higher_effort":
        state = "Intensidad demasiado alta"
    elif current["runs"] >= previous["runs"] + 2 or consistency["status"] == "recovering":
        state = "Recuperando consistencia"
    elif (
        long_run["recent_km"] < thresholds.long_run_minimum_km
        or (
            long_run["planned_target_km"]
            and long_run["recent_km"] < long_run["planned_target_km"] * thresholds.long_run_target_shortfall_ratio
        )
    ):
        state = "Falta tirada larga"
    elif distance_change is not None and distance_change >= thresholds.volume_growth_percent:
        state = "Volumen creciendo"
    elif aerobic["status"] == "improving" and consistency["status"] in {"good", "steady"}:
        state = "Mejorando"
    else:
        state = "Estable"

    opening = {
        "Datos insuficientes": "Todavía no hay suficientes carreras recientes para leer una tendencia confiable.",
        "Volumen creciendo demasiado rápido": "Tu volumen reciente subió de forma brusca frente al período anterior.",
        "Intensidad demasiado alta": "Las carreras comparables recientes muestran un pulso más alto.",
        "Recuperando consistencia": (
            f"Estás recuperando consistencia: corriste {current['runs']} veces en las últimas cuatro semanas, "
            "después de un período con menos actividad."
        ),
        "Falta tirada larga": (
            f"Tu frecuencia reciente suma {current['runs']} carreras, pero todavía falta consolidar la tirada larga."
        ),
        "Volumen creciendo": f"Tu volumen reciente creció hasta {_decimal_es(current['distance_km'])} km en cuatro semanas.",
        "Mejorando": f"Tu entrenamiento reciente combina {current['runs']} carreras con una mejor relación entre ritmo y pulso.",
        "Estable": f"Tu volumen y tu frecuencia se mantienen estables: {current['runs']} carreras en cuatro semanas.",
    }[state]

    if state == "Datos insuficientes":
        focus = "El próximo foco es sumar sesiones registradas antes de sacar conclusiones."
    elif state == "Volumen creciendo demasiado rápido":
        focus = "El próximo foco debería ser consolidar esa carga antes de volver a aumentarla."
    elif state == "Intensidad demasiado alta":
        focus = "El próximo foco debería ser recuperar carreras de esfuerzo controlado."
    elif long_run["planned_target_km"] and long_run["recent_km"] < long_run["planned_target_km"]:
        focus = (
            f"El próximo foco debería ser acercar gradualmente la tirada larga a "
            f"{_decimal_es(long_run['planned_target_km'])} km."
        )
    elif consistency["status"] in {"irregular", "recovering"}:
        target = f" de {planned_runs_per_week}" if planned_runs_per_week else ""
        focus = f"El próximo foco debería ser sostener una frecuencia semanal{target} carreras."
    else:
        focus = "El próximo foco debería ser sostener esta progresión sin sumar volumen e intensidad a la vez."

    return {"state": state, "text": f"{opening} {focus}"}


def build_run_progress(
    frame: pd.DataFrame,
    *,
    today: date,
    planned_long_run_km: float | None = None,
    planned_runs_per_week: int | None = None,
    plan_adherence_percent: float | None = None,
    thresholds: RunProgressThresholds = RUN_PROGRESS_THRESHOLDS,
) -> dict[str, Any]:
    quality = get_run_quality_flags(frame, thresholds)
    period_7 = get_period_summary(frame, quality, today=today, days=7, thresholds=thresholds)
    period_28 = get_period_summary(frame, quality, today=today, days=28, thresholds=thresholds)
    period_previous_28 = period_28["previous"]
    weekly = get_weekly_mileage(frame, quality, today=today, thresholds=thresholds)
    consistency = get_consistency_status(
        frame,
        quality,
        today=today,
        plan_adherence_percent=plan_adherence_percent,
        thresholds=thresholds,
    )
    aerobic = get_aerobic_efficiency_trend(frame, quality, today=today, thresholds=thresholds)
    long_run = get_long_run_progression(
        frame,
        quality,
        today=today,
        planned_target_km=planned_long_run_km,
        thresholds=thresholds,
    )
    average_4_weeks = {
        "days": 28,
        "current": {
            **period_28["current"],
            "distance_km": round(period_28["current"]["distance_km"] / 4, 1),
            "runs": round(period_28["current"]["runs"] / 4, 1),
        },
        "previous": {
            **period_previous_28,
            "distance_km": round(period_previous_28["distance_km"] / 4, 1),
            "runs": round(period_previous_28["runs"] / 4, 1),
        },
        "distance_change_percent": period_28["distance_change_percent"],
        "runs_change_percent": period_28["runs_change_percent"],
        "comparable_group": period_28["comparable_group"],
        "comparison_note": period_28["comparison_note"],
    }
    summary = get_training_summary(
        period_28=period_28,
        consistency=consistency,
        aerobic=aerobic,
        long_run=long_run,
        weekly=weekly,
        planned_runs_per_week=planned_runs_per_week,
        thresholds=thresholds,
    )
    volume = _volume_frame(frame, quality)
    return {
        "analysis_date": today.isoformat(),
        "summary": summary,
        "lifetime": {
            "runs": int(len(volume)),
            "distance_km": round(float(volume["distance_km"].sum()), 1) if not volume.empty else 0.0,
        },
        "periods": {"days_7": period_7, "days_28": period_28, "average_4_weeks": average_4_weeks},
        "consistency": consistency,
        "aerobic": aerobic,
        "long_run": long_run,
        "weekly": weekly,
        "activity_quality": quality,
        "quality_summary": {
            "flagged_activities": sum(bool(item["flags"]) for item in quality.values()),
            "excluded_from_aerobic_trend": sum(item["excluded_from_trend"] for item in quality.values()),
            "duplicate_like_excluded_from_aggregates": sum(item["duplicate_excluded"] for item in quality.values()),
        },
    }


def _aggregate_period(frame: pd.DataFrame) -> dict[str, Any]:
    if frame.empty:
        return {
            "distance_km": 0.0,
            "runs": 0,
            "average_duration_minutes": None,
            "longest_run_km": 0.0,
        }
    return {
        "distance_km": round(float(frame["distance_km"].sum()), 1),
        "runs": int(len(frame)),
        "average_duration_minutes": round(float(frame["moving_minutes"].mean())),
        "longest_run_km": round(float(frame["distance_km"].max()), 1),
    }


def _period_comparable(
    frame: pd.DataFrame,
    quality: dict[str, dict[str, Any]],
    current_start: date,
    current_end: date,
    previous_start: date,
    previous_end: date,
) -> dict[str, Any]:
    trend_ids = {activity_id for activity_id, item in quality.items() if not item["excluded_from_trend"]}
    trend = frame[frame["id"].astype(str).isin(trend_ids)]
    current_all = _between_dates(trend, current_start, current_end)
    previous_all = _between_dates(trend, previous_start, previous_end)
    for _, label, minimum, maximum in DISTANCE_GROUPS:
        current = current_all[(current_all["distance_km"] >= minimum) & (current_all["distance_km"] < maximum)]
        previous = previous_all[(previous_all["distance_km"] >= minimum) & (previous_all["distance_km"] < maximum)]
        if not current.empty and not previous.empty:
            return {
                "group": label,
                "note": f"Ritmo y pulso comparados solo en carreras de {label}.",
                "current": {
                    "comparable_pace_min_km": round(median(current["pace_min_km"].tolist()), 3),
                    "comparable_average_heartrate": round(median(current["average_heartrate"].tolist())),
                },
                "previous": {
                    "comparable_pace_min_km": round(median(previous["pace_min_km"].tolist()), 3),
                    "comparable_average_heartrate": round(median(previous["average_heartrate"].tolist())),
                },
            }
    empty = {"comparable_pace_min_km": None, "comparable_average_heartrate": None}
    return {
        "group": None,
        "note": "No hubo suficientes carreras equivalentes en ambos períodos.",
        "current": empty.copy(),
        "previous": empty.copy(),
    }


def _weekly_interpretation(
    points: list[dict[str, Any]], thresholds: RunProgressThresholds
) -> dict[str, str]:
    completed = points[:-1] if points and points[-1]["is_current"] else points
    if len(completed) < 4 or sum(point["distance_km"] > 0 for point in completed) < 3:
        return {"status": "insufficient", "label": "Datos insuficientes para leer la tendencia semanal."}
    last = float(completed[-1]["distance_km"])
    prior_three = [float(point["distance_km"]) for point in completed[-4:-1]]
    prior_average = sum(prior_three) / len(prior_three)
    if prior_average >= 5 and last > prior_average * thresholds.weekly_spike_ratio:
        return {"status": "spike", "label": "Pico de carga reciente."}
    window = min(4, len(completed) // 2)
    recent_average = sum(float(point["distance_km"]) for point in completed[-window:]) / window
    previous_values = completed[-window * 2 : -window]
    if not previous_values:
        return {"status": "insufficient", "label": "Datos insuficientes para leer la tendencia semanal."}
    previous_average = sum(float(point["distance_km"]) for point in previous_values) / len(previous_values)
    change = _safe_percent_change(recent_average, previous_average, thresholds.minimum_period_baseline_km)
    if change is None:
        return {"status": "insufficient", "label": "Sin base previa suficiente para comparar."}
    if change > thresholds.volume_spike_percent:
        return {"status": "spike", "label": "Pico de carga reciente."}
    if change >= thresholds.volume_growth_percent:
        return {"status": "growing", "label": "Volumen aumentando gradualmente."}
    if change <= thresholds.volume_decline_percent:
        return {"status": "decreasing", "label": "Volumen en descenso."}
    return {"status": "stable", "label": "Volumen semanal estable."}


def _volume_frame(frame: pd.DataFrame, quality: dict[str, dict[str, Any]]) -> pd.DataFrame:
    eligible_ids = {activity_id for activity_id, item in quality.items() if item["volume_eligible"]}
    return frame[frame["id"].astype(str).isin(eligible_ids)].copy()


def _between_dates(frame: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    if frame.empty:
        return frame.copy()
    dates = frame["start_date"].dt.date
    return frame[(dates >= start) & (dates <= end)].copy()


def _safe_percent_change(current: float, previous: float, minimum_baseline: float) -> float | None:
    if previous < minimum_baseline:
        return None
    return round((current / previous - 1) * 100)


def _near(first: float, second: float, ratio: float) -> bool:
    baseline = max(abs(first), abs(second), 0.001)
    return abs(first - second) / baseline <= ratio


def _finite_or(value: float, fallback: float) -> float:
    return value if math.isfinite(value) else fallback


def _decimal_es(value: float) -> str:
    return f"{value:.1f}".replace(".", ",")
