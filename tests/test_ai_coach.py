from strava_agent.ai_coach import build_coach_context, extract_output_text


def test_coach_context_uses_training_data_without_routes() -> None:
    context = build_coach_context(
        profile={"weight_kg": 78, "running_days": 5, "injury_notes": "Rodilla al empezar rápido"},
        metrics={
            "distance_current_week": 13.72,
            "distance_7d": 23.8,
            "average_weekly_28d": 26.4,
            "longest_42d": 10.1,
            "hr_coverage": 90,
        },
        recent_activities=[
            {"date": "2026-07-15", "distance_km": 6.2, "pace": "5:24 min/km", "average_heartrate": 149}
        ],
        plan_weeks=[
            {
                "start": "2026-07-13",
                "end": "2026-07-19",
                "phase": "Construcción",
                "target_km": 30,
                "long_run_km": 12,
                "sessions": ["Rodaje fácil"],
            }
        ],
        days_to_race=87,
    )

    assert "Peso: 78 kg" in context
    assert "13.7 km" in context
    assert "Rodilla al empezar rápido" in context
    assert "GPS" in context
    assert "latitud" not in context.lower()


def test_extracts_text_from_responses_api_payload() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "content": [{"type": "output_text", "text": "Empieza suave hoy."}],
            }
        ]
    }
    assert extract_output_text(payload) == "Empieza suave hoy."
