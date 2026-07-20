from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any


RACE_DATE = date(2026, 10, 11)
PLAN_START_DATE = date(2026, 7, 13)


@dataclass(frozen=True)
class TrainingWeek:
    number: int
    start: date
    end: date
    phase: str
    target_km: float
    long_run_km: float
    sessions: tuple[str, ...]
    session_objectives: tuple[str, ...]
    strength_recommendation: str
    bike_recommendation: str
    risk_level: str
    change_reason: str
    goal_status: str
    actual_km: float | None = None
    completion_percentage: float | None = None


def build_adaptive_plan(
    metrics: dict[str, Any],
    running_days: int = 4,
    goal_pace_seconds_km: int | None = None,
    checkin: dict[str, Any] | None = None,
    today: date | None = None,
    race_date: date = RACE_DATE,
    include_past: bool = False,
) -> list[TrainingWeek]:
    """Devuelve el calendario fijo y superpone solo el estado real del atleta.

    Los entrenamientos planificados no dependen de métricas ni del check-in. Los
    datos importados se usan únicamente para cumplimiento, riesgo y estado de la
    meta, de modo que un ZIP nunca reescriba el plan.
    """
    today = today or date.today()
    if today > race_date:
        return []

    del running_days  # El calendario acordado siempre tiene martes, jueves y domingo.
    first_monday = PLAN_START_DATE
    total_weeks = ((race_date - first_monday).days // 7) + 1
    current_week_start = today - timedelta(days=today.weekday())
    current_index = max(0, min((current_week_start - first_monday).days // 7, total_weeks - 1))
    current_planned = _three_day_targets(total_weeks - current_index - 1)[1]
    actual_current = float(metrics.get("distance_current_week", 0))
    completion = (actual_current / current_planned * 100) if current_planned else 0.0
    risk_level = _risk_level(checkin)
    goal_status = _goal_status(metrics, risk_level, total_weeks - current_index - 1, completion)
    adaptation_reason = _adaptation_reason(checkin, completion, risk_level)

    weeks: list[TrainingWeek] = []
    for index in range(total_weeks):
        start = first_monday + timedelta(weeks=index)
        end = min(start + timedelta(days=6), race_date)
        weeks_left_after = total_weeks - index - 1

        if weeks_left_after == 0:
            phase, target, long_run = "Carrera", 9.0, 0.0
        else:
            phase, target, long_run = _three_day_targets(weeks_left_after)

        sessions = _sessions_for_week(
            phase,
            target,
            long_run,
            3,
            weeks_left_after,
            goal_pace_seconds_km,
            "Bajo",
        )
        objectives = _session_objectives(phase, len(sessions))
        weeks.append(
            TrainingWeek(
                number=index + 1,
                start=start,
                end=end,
                phase=phase,
                target_km=round(target, 1),
                long_run_km=round(long_run, 1),
                sessions=sessions,
                session_objectives=objectives,
                strength_recommendation="Miércoles: fuerza de piernas moderada. Viernes: sesión ligera, sin llegar al fallo.",
                bike_recommendation="Lunes o sábado: 30–45 min de bicicleta suave opcional; omitir si hay fatiga.",
                risk_level=risk_level,
                change_reason=(
                    f"Lectura actual: {adaptation_reason} El calendario permanece fijo."
                    if index == current_index
                    else "Plan fijo: importar entrenamientos no modifica estas sesiones."
                ),
                goal_status=goal_status,
                actual_km=round(actual_current, 1) if index == current_index else None,
                completion_percentage=round(completion, 0) if index == current_index else None,
            )
        )
    return weeks if include_past else [week for week in weeks if week.end >= today]


def _sessions_for_week(
    phase: str,
    target_km: float,
    long_run_km: float,
    running_days: int,
    weeks_left: int,
    goal_pace_seconds_km: int | None,
    risk_level: str,
) -> tuple[str, ...]:
    if risk_level == "Alto":
        return (
            "Martes: descanso; no correr con dolor articular",
            "Jueves: bicicleta muy suave solo si no hay dolor al caminar",
            "Domingo: sin tirada larga; solicitar evaluación profesional",
        )
    if phase == "Carrera":
        race_pace = _pace_range(goal_pace_seconds_km, 3, 10, "ritmo maratón por esfuerzo")
        return (
            "Lunes: descanso y movilidad suave",
            "Martes: 5 km muy suaves",
            "Jueves: 4 km suaves con 4 progresivos cortos",
            f"Domingo: Maratón de Chicago — salida controlada a {race_pace}",
        )

    quality_km = max(5.0, min(12.0, target_km * 0.22))
    easy_budget = max(target_km - long_run_km - quality_km, 0)
    easy_sessions = max(running_days - 2, 1)
    easy_km = easy_budget / easy_sessions if easy_sessions else 0
    easy_pace = _pace_range(goal_pace_seconds_km, 55, 95, "ritmo conversacional")
    long_pace = _pace_range(goal_pace_seconds_km, 45, 80, "esfuerzo cómodo")
    marathon_pace = _pace_range(goal_pace_seconds_km, 3, 10, "ritmo maratón")
    tempo_pace = _pace_range(goal_pace_seconds_km, -20, -5, "tempo controlado")

    if phase == "Taper":
        quality = f"Martes: {quality_km:.0f} km controlados, con un bloque corto a {marathon_pace}"
    elif phase == "Base":
        quality = f"Martes: {quality_km:.0f} km totales con 3 × 3 min a {marathon_pace}, recuperando 2 min suave"
    elif phase == "Recuperación":
        quality = f"Martes: {quality_km:.0f} km suaves a {easy_pace}; sin trabajo intenso"
    elif weeks_left <= 5:
        marathon_block = max(3.0, quality_km - 4.0)
        quality = f"Martes: {quality_km:.0f} km totales, incluyendo {marathon_block:.0f} km a {marathon_pace}"
    else:
        quality = f"Martes: {quality_km:.0f} km totales con bloques a {tempo_pace} o cuestas por esfuerzo"

    sessions = [quality]
    available_days = ["Jueves", "Viernes", "Miércoles", "Lunes"]
    for index in range(easy_sessions):
        sessions.append(f"{available_days[index]}: {easy_km:.0f} km fáciles a {easy_pace}")
    sessions.append(f"Domingo: tirada larga de {long_run_km:.0f} km a {long_pace}; empieza por el extremo lento")
    return tuple(sessions)


def _three_day_targets(weeks_left: int) -> tuple[str, float, float]:
    schedule = {
        1: ("Taper", 18.0, 10.0),
        2: ("Taper", 28.0, 16.0),
        3: ("Taper", 36.0, 20.0),
        4: ("Específica", 42.0, 26.0),
        5: ("Específica", 40.0, 24.0),
        6: ("Recuperación", 34.0, 18.0),
        7: ("Construcción", 40.0, 22.0),
        8: ("Construcción", 34.0, 18.0),
        9: ("Recuperación", 28.0, 14.0),
        10: ("Construcción", 26.0, 14.0),
        11: ("Construcción", 22.0, 12.0),
    }
    return schedule.get(weeks_left, ("Base", 20.0, 10.0))


def _pace_range(goal_seconds: int | None, faster_delta: int, slower_delta: int, fallback: str) -> str:
    if not goal_seconds:
        return fallback
    faster = _format_pace_seconds(goal_seconds + faster_delta)
    slower = _format_pace_seconds(goal_seconds + slower_delta)
    return f"{faster}–{slower} min/km"


def _format_pace_seconds(total_seconds: int) -> str:
    safe_seconds = max(total_seconds, 1)
    return f"{safe_seconds // 60}:{safe_seconds % 60:02d}"


def _risk_level(checkin: dict[str, Any] | None) -> str:
    if not checkin:
        return "Moderado"
    if (
        bool(checkin.get("altered_gait"))
        or bool(checkin.get("swelling"))
        or bool(checkin.get("pain_walking"))
        or int(checkin.get("knee_pain", 0)) >= 5
    ):
        return "Alto"
    if int(checkin.get("knee_pain", 0)) >= 2 or int(checkin.get("fatigue", 1)) >= 4:
        return "Moderado"
    return "Bajo"


def _goal_status(metrics: dict[str, Any], risk: str, weeks_left: int, completion: float) -> str:
    weekly_average = float(metrics.get("average_weekly_28d", 0))
    longest = float(metrics.get("longest_42d", 0))
    if risk == "Alto":
        return "No respaldado"
    if weekly_average >= 35 and longest >= 22 and completion >= 75:
        return "Respaldado"
    if weeks_left <= 5 and (weekly_average < 30 or longest < 18):
        return "No respaldado"
    return "Dudoso"


def _adaptation_reason(checkin: dict[str, Any] | None, completion: float, risk: str) -> str:
    if not checkin:
        return "Falta el cierre semanal de fatiga y rodilla; se mantiene una valoración prudente."
    if risk == "Alto":
        return "Dolor o señales de alarma: se detiene la progresión y se sustituye la carga."
    if completion < 75:
        return "Cumplimiento inferior al 75%: se repite o reduce la carga; no se recuperan sesiones perdidas."
    if completion <= 100:
        return "Cumplimiento entre 75% y 100%: se mantiene la progresión prevista."
    if bool(checkin.get("effort_controlled")) and int(checkin.get("knee_pain", 0)) == 0:
        return "Semana completa, controlada y sin dolor: progresión moderada, sin aumentar también la intensidad."
    return "Semana completa, pero sin margen claro para progresar; se mantiene la carga."


def _session_objectives(phase: str, count: int) -> tuple[str, ...]:
    if phase == "Carrera":
        objectives = (
            "Recuperar y llegar fresco.",
            "Mantener movilidad y sensaciones.",
            "Activar sin acumular fatiga.",
            "Sostener el ritmo objetivo con salida conservadora.",
        )
    elif phase == "Recuperación":
        objectives = (
            "Favorecer recuperación aeróbica sin intensidad.",
            "Acumular tiempo en Z2 con bajo estrés.",
            "Conservar resistencia reduciendo la carga.",
        )
    elif phase == "Taper":
        objectives = (
            "Conservar economía y ritmo con poco volumen.",
            "Mantener Z2 sin generar fatiga.",
            "Reducir fatiga acumulada conservando resistencia.",
        )
    else:
        objectives = (
            "Mejorar umbral, economía y control del ritmo.",
            "Desarrollar base aeróbica en Z2.",
            "Aumentar resistencia y tolerancia al tiempo de carrera.",
        )
    return objectives[:count]
