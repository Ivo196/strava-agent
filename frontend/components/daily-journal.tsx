"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookHeart, CheckCircle2 } from "lucide-react";
import type { DashboardData } from "@/lib/types";

type Journal = DashboardData["daily_state"]["journal"];

export function DailyJournal({
  date,
  journal,
  disabled = false,
}: {
  date: string;
  journal: Journal;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const entry = journal.today;

  async function submit(formData: FormData) {
    if (disabled) return;
    setBusy(true);
    setMessage("");
    const payload = {
      local_date: date,
      fatigue: Number(formData.get("fatigue")),
      stress: Number(formData.get("stress")),
      soreness: Number(formData.get("soreness")),
      injury_note: String(formData.get("injury_note") ?? ""),
      alcohol_units: Number(formData.get("alcohol_units") || 0),
      caffeine_after_14: formData.get("caffeine_after_14") === "on",
      notes: String(formData.get("notes") ?? ""),
    };
    try {
      const response = await fetch("/api/backend/daily-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("No se pudo guardar el check-in diario.");
      setMessage("Check-in guardado. La recomendación ya considera tus sensaciones.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="performance-journal" aria-labelledby="daily-journal-title">
      <div className="performance-section-heading">
        <div>
          <span className="pace-kicker">Journal diario</span>
          <h2 id="daily-journal-title">Sensaciones que el sensor no ve</h2>
        </div>
        <span className="journal-count">
          {entry ? <CheckCircle2 size={15} /> : <BookHeart size={15} />}
          {entry ? "Registrado hoy" : `${journal.entry_count} registros`}
        </span>
      </div>

      <form action={submit} className="journal-form">
        <label>
          Fatiga
          <select name="fatigue" defaultValue={entry?.fatigue ?? 2} disabled={disabled}>
            <option value="1">1 · Muy baja</option>
            <option value="2">2 · Baja</option>
            <option value="3">3 · Media</option>
            <option value="4">4 · Alta</option>
            <option value="5">5 · Muy alta</option>
          </select>
        </label>
        <label>
          Estrés
          <select name="stress" defaultValue={entry?.stress ?? 2} disabled={disabled}>
            <option value="1">1 · Muy bajo</option>
            <option value="2">2 · Bajo</option>
            <option value="3">3 · Medio</option>
            <option value="4">4 · Alto</option>
            <option value="5">5 · Muy alto</option>
          </select>
        </label>
        <label>
          Molestia muscular (0–10)
          <input name="soreness" type="number" min="0" max="10" defaultValue={entry?.soreness ?? 0} disabled={disabled} />
        </label>
        <label>
          Alcohol (unidades)
          <input name="alcohol_units" type="number" min="0" max="20" step="0.5" defaultValue={entry?.alcohol_units ?? 0} disabled={disabled} />
        </label>
        <label className="journal-wide">
          Molestia o lesión
          <input name="injury_note" maxLength={500} defaultValue={entry?.injury_note ?? ""} placeholder="Zona y efecto al caminar o correr" disabled={disabled} />
        </label>
        <label className="journal-wide">
          Nota breve
          <textarea name="notes" maxLength={1000} defaultValue={entry?.notes ?? ""} placeholder="Energía, motivación, trabajo, viaje…" disabled={disabled} />
        </label>
        <label className="journal-checkbox">
          <input name="caffeine_after_14" type="checkbox" defaultChecked={Boolean(entry?.caffeine_after_14)} disabled={disabled} />
          Cafeína después de las 14:00
        </label>
        <button type="submit" disabled={busy || disabled}>
          {disabled ? "Desactivado en vista de prueba" : busy ? "Guardando…" : entry ? "Actualizar check-in" : "Guardar check-in"}
        </button>
        {message && <p className="journal-message" aria-live="polite">{message}</p>}
      </form>

      <div className="journal-insights" aria-live="polite">
        <strong>Asociaciones personales</strong>
        {journal.insights.length ? (
          journal.insights.map((insight) => <p key={insight}>{insight}</p>)
        ) : (
          <p>{journal.message} Necesitamos al menos {journal.minimum_for_insights} días con journal y sueño.</p>
        )}
      </div>
    </section>
  );
}
