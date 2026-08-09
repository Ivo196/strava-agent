from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any


RACE_DATE = date(2026, 10, 11)
PLAN_START_DATE = date(2026, 7, 20)


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


@dataclass(frozen=True)
class PlanWeekTemplate:
    phase: str
    target_km: float
    long_run_km: float
    sessions: tuple[str, ...]


PLAN_WEEKS: tuple[PlanWeekTemplate, ...] = (
    PlanWeekTemplate(
        "Base",
        21.0,
        11.0,
        (
            "Martes: 5 km a 5:25-5:40 min/km; objetivo central 5:30 min/km",
            "Jueves: 5 km a 5:30-5:45 min/km",
            "Sábado: tirada larga de 11 km a 5:35-5:50 min/km; empieza controlado",
        ),
    ),
    PlanWeekTemplate(
        "Base",
        24.0,
        12.0,
        (
            "Martes: 6 km a 5:25-5:40 min/km, más 4-6 pasadas de 80-100 m a 4:25-4:45 min/km",
            "Jueves: 6 km a 5:30-5:45 min/km",
            "Sábado: tirada larga de 12 km a 5:35-5:50 min/km; empieza controlado",
        ),
    ),
    PlanWeekTemplate(
        "Recuperación",
        21.0,
        10.0,
        (
            "Martes: 5 km a 5:35-5:50 min/km",
            "Jueves: 6 km a 5:30-5:45 min/km",
            "Sábado: tirada larga de 10 km a 5:40-5:55 min/km",
        ),
    ),
    PlanWeekTemplate(
        "Construcción",
        28.0,
        14.0,
        (
            "Lunes: 7 km regenerativos a 5:30-5:45 min/km",
            "Miércoles: 7 km totales de pasadas con 3 x 5 min a 5:05-5:15 min/km; resto a 5:35-5:50 min/km",
            "Sábado: tirada larga de 14 km a 5:35-5:50 min/km",
        ),
    ),
    PlanWeekTemplate(
        "Construcción",
        32.0,
        16.0,
        (
            "Lunes: 8 km regenerativos a 5:30-5:45 min/km",
            "Miércoles: 8 km totales, más 4-6 pasadas de 80-100 m a 4:25-4:45 min/km",
            "Sábado: tirada larga de 16 km a 5:35-5:50 min/km",
        ),
    ),
    PlanWeekTemplate(
        "Recuperación",
        27.0,
        13.0,
        (
            "Lunes: 7 km regenerativos a 5:35-5:50 min/km",
            "Miércoles: 7 km totales a 5:35-5:50 min/km con 4 pasadas controladas de 80 m",
            "Sábado: tirada larga de 13 km a 5:40-5:55 min/km",
        ),
    ),
    PlanWeekTemplate(
        "Específica",
        35.0,
        18.0,
        (
            "Lunes: 8 km regenerativos a 5:30-5:45 min/km",
            "Miércoles: 9 km totales con 4 x 1 km a 4:55-5:00 min/km y 2 min suaves entre pasadas; resto a 5:35-5:50 min/km",
            "Sábado: tirada larga de 18 km a 5:35-5:55 min/km",
        ),
    ),
    PlanWeekTemplate(
        "Específica",
        40.0,
        22.0,
        (
            "Lunes: 8 km regenerativos a 5:30-5:45 min/km",
            "Miércoles: 10 km totales con 5 x 1 km a 4:55-5:00 min/km y 2 min suaves entre pasadas; resto a 5:35-5:50 min/km",
            "Sábado: tirada larga de 22 km a 5:35-5:55 min/km; reducir a 18-20 km si la recuperación no es buena",
        ),
    ),
    PlanWeekTemplate(
        "Taper",
        32.0,
        17.0,
        (
            "Lunes: 7 km regenerativos a 5:30-5:45 min/km",
            "Miércoles: 8 km totales con 3 x 1 km a 4:55-5:00 min/km y 2 min suaves entre pasadas; resto a 5:35-5:50 min/km",
            "Sábado: tirada larga de 17 km a 5:40-5:55 min/km",
        ),
    ),
    PlanWeekTemplate(
        "Taper",
        25.0,
        13.0,
        (
            "Lunes: 6 km regenerativos a 5:35-5:50 min/km",
            "Miércoles: 6 km totales con 3 x 1 km a 4:55-5:00 min/km y 2 min suaves entre pasadas; resto a 5:40-5:55 min/km",
            "Sábado: tirada larga de 13 km a 5:40-5:55 min/km",
        ),
    ),
    PlanWeekTemplate(
        "Taper",
        17.0,
        8.0,
        (
            "Lunes: 4 km regenerativos a 5:50-6:10 min/km",
            "Miércoles: 5 km totales a 5:35-5:50 min/km, más 4 pasadas de 80 m a 4:25-4:45 min/km",
            "Sábado: 8 km a 5:40-5:55 min/km",
        ),
    ),
    PlanWeekTemplate(
        "Carrera",
        9.0,
        0.0,
        (
            "Lunes: 5 km regenerativos a 5:35-5:50 min/km",
            "Miércoles: 4 km a 5:50-6:10 min/km con 4 pasadas progresivas cortas",
            "Domingo: Maratón de Chicago; primeros 5 km a 5:00-5:05 min/km y luego 4:55 min/km solo si está controlado",
        ),
    ),
)


def build_adaptive_plan(
    metrics: dict[str, Any],
    running_days: int = 3,
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

    del running_days, goal_pace_seconds_km  # El plan acordado ya contiene días y paces explícitos.
    first_monday = PLAN_START_DATE
    total_weeks = len(PLAN_WEEKS)
    current_week_start = today - timedelta(days=today.weekday())
    current_index = max(0, min((current_week_start - first_monday).days // 7, total_weeks - 1))
    current_planned = PLAN_WEEKS[current_index].target_km
    actual_current = float(metrics.get("distance_current_week", 0))
    completion = (actual_current / current_planned * 100) if current_planned else 0.0
    risk_level = _risk_level(checkin)
    goal_status = _goal_status(metrics, risk_level, total_weeks - current_index - 1, completion)
    adaptation_reason = _adaptation_reason(checkin, completion, risk_level)

    weeks: list[TrainingWeek] = []
    for index, template in enumerate(PLAN_WEEKS):
        start = first_monday + timedelta(weeks=index)
        end = min(start + timedelta(days=6), race_date)
        weeks_left_after = total_weeks - index - 1
        phase = template.phase
        target = template.target_km
        long_run = template.long_run_km
        sessions = template.sessions
        objectives = _session_objectives(phase, len(sessions), legacy=index < 3)
        if index < 3:
            plan_note = "Bloque 1: pace ajustado alrededor de 5:30 min/km, con la tirada larga algo más controlada."
        else:
            plan_note = (
                "Calendario ajustado desde la semana 4: lunes regenerativo, miércoles de pasadas, "
                "sábado de fondo y gimnasio martes, jueves, viernes y domingo."
            )
        if index < 3:
            strength_recommendation = (
                "Miércoles: fuerza de piernas moderada. Viernes: movilidad y core; "
                "sin fuerza de piernas antes de la tirada larga."
            )
            bike_recommendation = (
                "Lunes: 30-45 min de bicicleta suave opcional; omitir si hay fatiga "
                "o si la mano no permite frenar con seguridad."
            )
        elif phase == "Carrera":
            strength_recommendation = (
                "Martes y jueves: tren superior y core, sin piernas. Viernes: solo activación "
                "muy ligera de piernas, sin fatiga. Domingo: la maratón reemplaza el gimnasio."
            )
            bike_recommendation = "Sin bicicleta planificada durante la semana de carrera."
        else:
            strength_recommendation = (
                "Martes y jueves: tren superior, core y trabajo que no involucre piernas. "
                "Viernes y domingo: piernas en el gimnasio; el viernes sin llegar al fallo "
                "para proteger el fondo del sábado y el domingo según recuperación."
            )
            bike_recommendation = (
                "Sin bicicleta planificada; usarla solo como sustitución regenerativa, no como carga adicional."
            )
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
                strength_recommendation=strength_recommendation,
                bike_recommendation=bike_recommendation,
                risk_level=risk_level,
                change_reason=(
                    f"Lectura actual: {adaptation_reason} {plan_note}"
                    if index == current_index
                    else plan_note
                ),
                goal_status=goal_status,
                actual_km=round(actual_current, 1) if index == current_index else None,
                completion_percentage=round(completion, 0) if index == current_index else None,
            )
        )
    return weeks if include_past else [week for week in weeks if week.end >= today]


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
        return "Estado calculado automáticamente con las actividades y la carga sincronizadas; el plan se mantiene estable."
    if risk == "Alto":
        return "Dolor o señales de alarma: se detiene la progresión y se sustituye la carga."
    if completion < 75:
        return "Cumplimiento inferior al 75%: se repite o reduce la carga; no se recuperan sesiones perdidas."
    if completion <= 100:
        return "Cumplimiento entre 75% y 100%: se mantiene la progresión prevista."
    if bool(checkin.get("effort_controlled")) and int(checkin.get("knee_pain", 0)) == 0:
        return "Semana completa, controlada y sin dolor: progresión moderada, sin aumentar también la intensidad."
    return "Semana completa, pero sin margen claro para progresar; se mantiene la carga."


def _session_objectives(phase: str, count: int, *, legacy: bool = False) -> tuple[str, ...]:
    if legacy:
        if phase == "Recuperación":
            objectives = (
                "Favorecer la recuperación aeróbica con el ritmo indicado.",
                "Acumular kilómetros controlados con bajo estrés.",
                "Conservar resistencia reduciendo la carga.",
            )
        else:
            objectives = (
                "Mejorar economía y control del ritmo indicado.",
                "Desarrollar la base aeróbica con continuidad.",
                "Aumentar resistencia y tolerancia al tiempo de carrera.",
            )
        return objectives[:count]
    if phase == "Carrera":
        objectives = (
            "Soltar las piernas y recuperar sin acumular fatiga.",
            "Activar con pasadas cortas y controladas.",
            "Sostener el ritmo objetivo con salida conservadora.",
        )
    elif phase == "Recuperación":
        objectives = (
            "Favorecer la recuperación aeróbica con el ritmo indicado.",
            "Mantener técnica y velocidad con pasadas controladas y poco estrés.",
            "Conservar resistencia reduciendo la carga.",
        )
    elif phase == "Taper":
        objectives = (
            "Recuperar con poco volumen y ritmo cómodo.",
            "Conservar economía y velocidad con pasadas sin generar fatiga.",
            "Reducir fatiga acumulada conservando resistencia.",
        )
    else:
        objectives = (
            "Recuperar y desarrollar la base aeróbica con continuidad.",
            "Mejorar economía, velocidad y control del ritmo en las pasadas.",
            "Aumentar resistencia y tolerancia al tiempo de carrera.",
        )
    return objectives[:count]
