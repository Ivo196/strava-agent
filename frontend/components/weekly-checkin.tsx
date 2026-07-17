"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { localIsoDate } from "@/lib/local-clock";

export function WeeklyCheckin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    const payload = {
      local_date: localIsoDate(),
      fatigue: Number(formData.get("fatigue")),
      knee_pain: Number(formData.get("knee_pain")),
      effort_controlled: formData.get("effort_controlled") === "on",
      altered_gait: formData.get("altered_gait") === "on",
      swelling: formData.get("swelling") === "on",
      pain_walking: formData.get("pain_walking") === "on",
      notes: String(formData.get("notes") ?? ""),
    };
    try {
      const response = await fetch("/api/backend/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("No se pudo guardar el cierre semanal.");
      setMessage("Cierre guardado. Tu estado fue actualizado; el plan sigue sin cambios.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="checkin-card">
      <summary><ClipboardCheck size={17} /><span><strong>Cierre semanal</strong><small>Completa esto el domingo después de importar tus carreras.</small></span></summary>
      <form action={submit}>
        <div className="checkin-grid">
          <label>Fatiga (1–5)<select name="fatigue" defaultValue="2"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>
          <label>Dolor de rodilla (0–10)<input name="knee_pain" type="number" min="0" max="10" defaultValue="0" /></label>
        </div>
        <div className="check-list">
          <label><input type="checkbox" name="effort_controlled" defaultChecked /> Esfuerzo controlado</label>
          <label><input type="checkbox" name="altered_gait" /> Alteración de zancada</label>
          <label><input type="checkbox" name="swelling" /> Hinchazón</label>
          <label><input type="checkbox" name="pain_walking" /> Dolor al caminar</label>
        </div>
          <label className="checkin-notes">Notas<textarea name="notes" placeholder="Sueño, clima, terreno, gimnasio o sensaciones…" /></label>
        <button className="primary-button" disabled={busy}>{busy ? "Analizando…" : "Guardar estado semanal"}</button>
        {message && <p className="form-message">{message}</p>}
      </form>
    </details>
  );
}
