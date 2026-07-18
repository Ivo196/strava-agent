from __future__ import annotations

from typing import Any

import requests


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

COACH_INSTRUCTIONS = """Eres el entrenador de running de Ivo para la Maratón de Chicago del 11 de octubre de 2026.
Responde siempre en español, de forma breve, clara y accionable.
Escribe en Markdown legible. Empieza con un veredicto directo de una o dos frases y después usa solo las secciones que aporten valor: **Estado**, **Lo que va bien**, **Qué mejorar** y **Próxima acción**.
Usa listas cortas y resalta cifras importantes en negrita. Evita bloques largos, introducciones genéricas, repetir la pregunta y tablas innecesarias.
Salvo que el usuario pida profundidad, limita la respuesta a unas 250 palabras. Para una pregunta simple, responde todavía más corto.
Usa solamente los datos del contexto; no inventes ritmos, lesiones ni sesiones.
Distingue observaciones de recomendaciones. Prioriza progresión gradual, recuperación y adherencia.
El objetivo de ritmo está definido en el contexto del atleta y debe clasificarse como Respaldado, Dudoso o No respaldado según los datos.
La estructura es martes calidad, jueves Z2 y domingo tirada larga; nunca juntes dos sesiones intensas.
El calendario de entrenamiento está bloqueado: nunca afirmes que lo cambiaste ni reescribas sus sesiones, distancias o fechas.
Compara lo realizado con ese plan fijo y explica qué va bien, qué debe mejorar y qué señales requieren prudencia.
Antes de llamar incompleta o perdida a una sesión, comprueba la fecha local: una sesión futura de la semana todavía está pendiente, no incumplida.
No recuperes una sesión perdida acumulándola. No aumentes volumen e intensidad a la vez. Permite sustituir por bicicleta suave y recomienda fuerza sin interferir con la tirada larga.
Ivo refiere dolor de rodilla cuando empieza demasiado rápido: recuérdale calentar y comenzar suave, y nunca aconsejes correr con dolor que empeora.
No diagnostiques. Si hay dolor intenso o persistente, inflamación, inestabilidad, dolor de pecho, desmayo o falta de aire inusual, recomienda detenerse y consultar a un profesional.
Puedes aconsejar cómo ejecutar con seguridad la próxima sesión o recomendar no correr ante señales de alarma, pero cualquier cambio del calendario requiere aceptación explícita del usuario.
"""


def build_coach_context(
    profile: dict[str, Any],
    metrics: dict[str, Any],
    recent_activities: list[dict[str, Any]],
    plan_weeks: list[dict[str, Any]],
    days_to_race: int,
    current_date: str | None = None,
    recovery: dict[str, Any] | None = None,
) -> str:
    weight = profile.get("weight_kg")
    goal_pace = _format_goal_pace(profile.get("goal_pace_seconds_km"))
    lines = [
        "CONTEXTO ACTUAL DEL ATLETA",
        f"Fecha local de análisis: {current_date}" if current_date else "Fecha local de análisis: no informada",
        f"Días hasta la carrera: {days_to_race}",
        f"Peso: {weight} kg" if weight else "Peso: no informado",
        f"Días disponibles para correr: {profile.get('running_days') or 4} por semana",
        f"Ritmo objetivo de maratón: {goal_pace}",
        f"Notas de molestias: {profile.get('injury_notes') or 'ninguna informada'}",
        f"Preferencias de entrenamiento: {profile.get('training_notes') or 'ninguna informada'}",
        f"Distancia esta semana: {float(metrics.get('distance_current_week', 0)):.1f} km",
        f"Distancia últimos 7 días: {float(metrics.get('distance_7d', 0)):.1f} km",
        f"Promedio semanal últimos 28 días: {float(metrics.get('average_weekly_28d', 0)):.1f} km",
        f"Tirada más larga últimos 42 días: {float(metrics.get('longest_42d', 0)):.1f} km",
        f"Carga últimos 7 días: {float(metrics.get('load_7d', 0)):.1f}; semana anterior: {float(metrics.get('load_previous_7d', 0)):.1f}",
        f"Cobertura de frecuencia cardíaca: {float(metrics.get('hr_coverage', 0)):.0f}%",
        "",
        "RECUPERACIÓN CONSOLIDADA DE APPLE HEALTH Y GOOGLE HEALTH",
    ]
    recovery = recovery or {}
    source_context = recovery.get("_context") or {}
    if source_context.get("fitbit_sensor_first"):
        lines.append(
            "- Fitbit es una pulsera nueva: hay "
            f"{source_context.get('fitbit_sensor_points', 0)} muestras pasivas desde "
            f"{source_context['fitbit_sensor_first']}. No atribuir a Fitbit datos anteriores "
            "ni considerar que ya existe una tendencia propia del dispositivo."
        )
    for label, key in (
        ("HRV media 7 días", "hrv"),
        ("FC en reposo media 7 días", "resting_hr"),
        ("VO2 máx.", "vo2_max"),
        ("Sueño más reciente", "sleep"),
        ("Peso más reciente", "weight"),
    ):
        item = recovery.get(key)
        if item:
            lines.append(f"- {label}: {item['value']} {item['unit']} ({item['date']})")
        else:
            lines.append(f"- {label}: sin dato")

    lines.extend(["", "ÚLTIMAS CARRERAS (sin rutas GPS)"])
    for activity in recent_activities[:8]:
        dynamics = activity.get("running_dynamics") or {}
        dynamics_text = ""
        if dynamics:
            dynamics_text = (
                f", potencia {dynamics.get('power_w', 'sin dato')} W, "
                f"contacto {dynamics.get('ground_contact_ms', 'sin dato')} ms, "
                f"zancada {dynamics.get('stride_m', 'sin dato')} m, "
                f"oscilación {dynamics.get('vertical_oscillation_cm', 'sin dato')} cm"
            )
        lines.append(
            f"- {activity.get('date')}: {float(activity.get('distance_km', 0)):.1f} km, "
            f"ritmo {activity.get('pace') or 'sin dato'}, FC media {activity.get('average_heartrate') or 'sin dato'}, "
            f"desnivel {activity.get('elevation_gain_m', 'sin dato')} m, carga {activity.get('training_load', 'sin dato')}"
            f"{dynamics_text}"
        )
    if not recent_activities:
        lines.append("- Sin carreras registradas")

    lines.extend(["", "PRÓXIMAS SEMANAS DEL PLAN FIJO (solo referencia; no modificar)"])
    for week in plan_weeks[:3]:
        lines.append(
            f"- {week['start']} a {week['end']}: {week['phase']}, objetivo {week['target_km']} km, "
            f"tirada larga {week['long_run_km']} km, riesgo {week.get('risk_level', 'sin dato')}, "
            f"objetivo {goal_pace} {week.get('goal_status', 'sin dato')}. "
            f"Motivo: {week.get('change_reason', 'sin dato')}. Sesiones: {' | '.join(week['sessions'])}"
        )
    return "\n".join(lines)


def _format_goal_pace(seconds: Any) -> str:
    if not seconds:
        return "no informado"
    total = int(seconds)
    finish_minutes = total * 42.195 / 60
    hours = int(finish_minutes // 60)
    minutes = int(finish_minutes % 60)
    remaining_seconds = int(round((finish_minutes - int(finish_minutes)) * 60))
    return f"{total // 60}:{total % 60:02d} min/km (aprox. {hours}:{minutes:02d}:{remaining_seconds:02d})"


def ask_coach(
    *,
    api_key: str,
    model: str,
    context: str,
    message: str,
    history: list[dict[str, str]],
    timeout: int = 60,
) -> str:
    input_messages: list[dict[str, Any]] = [
        {"role": "user", "content": [{"type": "input_text", "text": context}]},
        {
            "role": "assistant",
            "content": [{"type": "output_text", "text": "Entendido. Usaré este contexto para entrenarte con prudencia."}],
        },
    ]
    for item in history[-10:]:
        input_messages.append(
            {
                "role": item["role"],
                "content": [
                    {
                        "type": "input_text" if item["role"] == "user" else "output_text",
                        "text": item["content"],
                    }
                ],
            }
        )
    input_messages.append({"role": "user", "content": [{"type": "input_text", "text": message}]})

    response = requests.post(
        OPENAI_RESPONSES_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "instructions": COACH_INSTRUCTIONS,
            "input": input_messages,
            "max_output_tokens": 800,
        },
        timeout=timeout,
    )
    if response.status_code == 401:
        raise ValueError("La clave de OpenAI no es válida. Revisa OPENAI_API_KEY.")
    if response.status_code == 429:
        raise ValueError("OpenAI alcanzó el límite de uso o saldo. Revisa la facturación de la API.")
    try:
        response.raise_for_status()
    except requests.HTTPError as error:
        raise ValueError(f"OpenAI no pudo responder (HTTP {response.status_code}).") from error

    answer = extract_output_text(response.json())
    if not answer:
        raise ValueError("OpenAI respondió sin texto. Inténtalo de nuevo.")
    return answer


def extract_output_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"].strip()
    parts: list[str] = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for block in item.get("content", []):
            if block.get("type") == "output_text" and isinstance(block.get("text"), str):
                parts.append(block["text"].strip())
    return "\n".join(part for part in parts if part)
