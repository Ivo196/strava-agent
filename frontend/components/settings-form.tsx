"use client";

import { useState } from "react";
import { Activity, ArchiveRestore, RefreshCw, Save } from "lucide-react";
import type { GoogleHealthStatus, Profile } from "@/lib/types";

function parsePace(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= 180 && seconds <= 600 ? seconds : null;
}

function formatPace(seconds: number | null): string {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function SettingsForm({
  profile,
  googleHealth,
}: {
  profile: Profile;
  googleHealth: GoogleHealthStatus | null;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState("");

  async function saveProfile(formData: FormData) {
    setBusy("profile");
    setMessage("");
    const nullableNumber = (name: string) => {
      const value = String(formData.get(name) ?? "").trim();
      return value ? Number(value) : null;
    };
    const body = {
      display_name: String(formData.get("display_name") ?? ""),
      age: nullableNumber("age"),
      height_cm: nullableNumber("height_cm"),
      weight_kg: nullableNumber("weight_kg"),
      resting_hr: nullableNumber("resting_hr"),
      max_hr: nullableNumber("max_hr"),
      running_days: Number(formData.get("running_days")),
      goal_time_minutes: nullableNumber("goal_time_minutes"),
      goal_pace_seconds_km: parsePace(String(formData.get("goal_pace") ?? "")),
      injury_notes: String(formData.get("injury_notes") ?? ""),
      training_notes: String(formData.get("training_notes") ?? ""),
    };
    try {
      const response = await fetch("/api/backend/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("No se pudo guardar el perfil");
      setError(false);
      setMessage("Perfil guardado correctamente.");
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : "Error inesperado");
    } finally {
      setBusy("");
    }
  }

  async function importArchive(formData: FormData) {
    const selected = formData.get("file");
    if (!(selected instanceof File) || !selected.size) {
      setError(true);
      setMessage("Selecciona el ZIP descargado desde Strava.");
      return;
    }
    setBusy("archive");
    setMessage("");
    try {
      const response = await fetch("/api/backend/import/strava-archive", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "No se pudo importar el archivo");
      setError(false);
      setMessage(`${result.imported} carreras nuevas y ${result.updated} actualizadas. El visualizador ya está al día.`);
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : "Error inesperado");
    } finally {
      setBusy("");
    }
  }

  async function syncGoogleHealth() {
    setBusy("google-health");
    setMessage("");
    try {
      const response = await fetch("/api/backend/google-health/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "No se pudo sincronizar Google Health");
      setError(false);
      const suffix = result.errors?.length
        ? ` ${result.errors.length} tipos todavía no entregaron datos.`
        : "";
      setMessage(
        `Google Health actualizado: ${result.points_received} mediciones procesadas.${suffix}`,
      );
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : "Error inesperado");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="settings-grid">
      <section className="settings-panel">
        <div className="settings-heading"><div><span className="eyebrow">Atleta</span><h2>Contexto de entrenamiento</h2></div><span className="system-badge">Métrico · SI</span></div>
        <p>La información necesaria para interpretar volumen, ritmos y recuperación. Distancias en kilómetros, elevación en metros y peso en kilogramos.</p>
        <form action={saveProfile}>
          <div className="form-grid">
            <div className="field full"><label htmlFor="display_name">Nombre</label><input id="display_name" name="display_name" defaultValue={profile.display_name ?? ""} /></div>
            <div className="field"><label htmlFor="age">Edad</label><input id="age" name="age" type="number" min="16" max="90" defaultValue={profile.age ?? ""} /></div>
            <div className="field"><label htmlFor="weight_kg">Peso (kg)</label><input id="weight_kg" name="weight_kg" type="number" step="0.1" min="40" max="180" defaultValue={profile.weight_kg ?? 78} /></div>
            <div className="field"><label htmlFor="height_cm">Altura (cm)</label><input id="height_cm" name="height_cm" type="number" step="0.5" min="130" max="220" defaultValue={profile.height_cm ?? ""} /></div>
            <div className="field"><label htmlFor="running_days">Días de carrera</label><select id="running_days" name="running_days" defaultValue={profile.running_days ?? 5}><option value="3">3 días</option><option value="4">4 días</option><option value="5">5 días</option><option value="6">6 días</option></select></div>
            <div className="field"><label htmlFor="resting_hr">FC en reposo</label><input id="resting_hr" name="resting_hr" type="number" min="30" max="100" defaultValue={profile.resting_hr ?? ""} /></div>
            <div className="field"><label htmlFor="max_hr">FC máxima observada</label><input id="max_hr" name="max_hr" type="number" min="100" max="230" defaultValue={profile.max_hr ?? ""} /></div>
            <div className="field"><label htmlFor="goal_pace">Ritmo objetivo (min/km)</label><input id="goal_pace" name="goal_pace" inputMode="numeric" placeholder="4:55" defaultValue={formatPace(profile.goal_pace_seconds_km)} /></div>
            <div className="field"><label htmlFor="goal_time_minutes">Tiempo objetivo calculado (min)</label><input id="goal_time_minutes" name="goal_time_minutes" type="number" step="0.1" min="120" max="420" readOnly defaultValue={profile.goal_time_minutes ?? ""} /></div>
            <div className="field full"><label htmlFor="injury_notes">Molestias o restricciones</label><textarea id="injury_notes" name="injury_notes" defaultValue={profile.injury_notes ?? ""} placeholder="Por ejemplo: dolor de rodilla si empiezo demasiado rápido." /></div>
            <div className="field full"><label htmlFor="training_notes">Preferencias de entrenamiento</label><textarea id="training_notes" name="training_notes" defaultValue={profile.training_notes ?? ""} placeholder="Días preferidos, gimnasio y descanso." /></div>
          </div>
          <div className="button-row"><button className="primary-button" disabled={busy === "profile"}><Save size={15} />{busy === "profile" ? "Guardando…" : "Guardar perfil"}</button></div>
        </form>
      </section>

      <section className="settings-panel">
        <span className="eyebrow">Fuentes de datos</span>
        <h2>Dispositivos conectados</h2>
        <p>Apple Health conserva los entrenamientos y Google Health incorpora la recuperación medida por Fitbit. PaceOS prioriza la fuente adecuada y evita modificar el plan fijo.</p>
        <div className="source-status"><span className="source-dot" /><div><strong>Sincronización automática activa</strong><small>JSON v2 · unidades normalizadas al sistema métrico</small></div></div>
        <div className="connected-source">
          <div className="settings-heading">
            <div>
              <span className="eyebrow">Google Health · Fitbit</span>
              <h2>{googleHealth?.connected ? "Pulsera conectada" : "Conectar recuperación"}</h2>
            </div>
            <Activity size={20} aria-hidden="true" />
          </div>
          <p>
            {googleHealth?.connected
              ? `${googleHealth.fitbit_sensor_points.toLocaleString("es-ES")} muestras del sensor Fitbit desde que se activó. ${googleHealth.consolidated_points.toLocaleString("es-ES")} registros adicionales fueron importados o derivados por Google.`
              : "Sueño, HRV, frecuencia cardiaca en reposo, SpO₂, respiración, temperatura, zonas y VO₂ máx."}
          </p>
          <div className="button-row">
            {googleHealth?.connected ? (
              <button
                className="secondary-button"
                type="button"
                onClick={syncGoogleHealth}
                disabled={busy === "google-health"}
              >
                <RefreshCw size={15} />
                {busy === "google-health" ? "Sincronizando…" : "Actualizar Fitbit"}
              </button>
            ) : (
              <a className="primary-button" href="/api/google-health/connect">
                Conectar con Google
              </a>
            )}
          </div>
          {googleHealth?.last_sync && (
            <small className="source-meta">
              Última recepción: {new Date(googleHealth.last_sync.received_at).toLocaleString("es-ES")}
            </small>
          )}
        </div>
        <div className="legacy-import">
          <span className="eyebrow">Importación histórica opcional</span>
          <p>Usa un ZIP de Strava solo para completar actividades anteriores que no estén en Apple Health.</p>
        <form action={importArchive} className="archive-form">
          <div className="field"><label htmlFor="archive-file">ZIP de Strava</label><input id="archive-file" name="file" type="file" accept=".zip,application/zip" /></div>
          <button className="primary-button" disabled={Boolean(busy)}><ArchiveRestore size={15} />{busy === "archive" ? "Actualizando…" : "Actualizar entrenamientos"}</button>
        </form>
        <a className="export-help" href="https://www.strava.com/athlete/delete_your_account" target="_blank" rel="noreferrer">Solicitar descarga en Strava →</a>
        </div>
        {message && <p className={error ? "form-message error" : "form-message"}>{message}</p>}
      </section>
    </div>
  );
}
