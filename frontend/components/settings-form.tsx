"use client";

import { useState } from "react";
import { Activity, CheckCircle2, RefreshCw, TriangleAlert, Watch } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AppleHealthStatus, GoogleHealthStatus } from "@/lib/types";

export function SettingsForm({
  appleHealth,
  googleHealth,
}: {
  appleHealth: AppleHealthStatus;
  googleHealth: GoogleHealthStatus;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastApple = appleHealth.last_sync;
  const appleReceptionNeedsAttention = Boolean(
    lastApple?.result_recorded
    && lastApple.workouts_received > 0
    && lastApple.runs_imported + lastApple.runs_updated === 0
    && lastApple.workouts_skipped > 0,
  );

  async function syncGoogleHealth() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/backend/google-health/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "No se pudo sincronizar Google Health");
      setError(false);
      const suffix = result.errors?.length
        ? ` ${result.errors.length} tipos todavía no entregaron datos.`
        : "";
      setMessage(`Google Health actualizado: ${result.points_received} mediciones procesadas.${suffix}`);
      router.refresh();
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-grid">
      <section className="settings-panel">
        <div className="settings-heading">
          <div><span className="eyebrow">Fuentes de datos</span><h2>Dispositivos conectados</h2></div>
          <span className="system-badge">Métrico · SI</span>
        </div>
        <p>Apple Health conserva los entrenamientos y Google Health incorpora la recuperación medida por Fitbit. Tus datos deportivos ya están guardados internamente y no necesitan un formulario de perfil.</p>
        <div className="source-status"><span className="source-dot" /><div><strong>Sincronización automática activa</strong><small>JSON v2 · unidades normalizadas al sistema métrico</small></div></div>
        <div className="connected-source">
          <div className="settings-heading">
            <div>
              <span className="eyebrow">Apple Watch · Auto Export</span>
              <h2>{appleHealth.configured ? "Carreras conectadas" : "Configurar carreras"}</h2>
            </div>
            <Watch size={20} aria-hidden="true" />
          </div>
          <p>
            Solo se muestran carreras recibidas por Auto Export o por el historial nativo de Apple Health.
            Las copias sin ruta o con origen distinto se descartan del panel.
          </p>
          {lastApple && (
            <div className={appleReceptionNeedsAttention ? "source-receipt is-warning" : "source-receipt is-ok"}>
              {appleReceptionNeedsAttention ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}
              <div>
                <strong>{appleReceptionNeedsAttention ? "El último envío necesita revisión" : "Último envío procesado"}</strong>
                <span>
                  {lastApple.workouts_received} entrenamientos recibidos
                  {lastApple.result_recorded
                    ? ` · ${lastApple.runs_imported} nuevas · ${lastApple.runs_updated} actualizadas · ${lastApple.workouts_skipped} omitidas`
                    : " · detalle disponible desde la próxima recepción"}
                </span>
              </div>
            </div>
          )}
          {appleHealth.latest_run && (
            <small className="source-meta">
              Última carrera aceptada: {new Date(appleHealth.latest_run.start_date).toLocaleString("es-ES")} · {appleHealth.latest_run.distance_km.toLocaleString("es-ES")} km
            </small>
          )}
          {lastApple && (
            <small className="source-meta">Última recepción: {new Date(lastApple.received_at).toLocaleString("es-ES")}</small>
          )}
        </div>
        <div className="connected-source">
          <div className="settings-heading">
            <div>
              <span className="eyebrow">Google Health · Fitbit</span>
              <h2>{googleHealth.connected ? "Pulsera conectada" : "Conectar recuperación"}</h2>
            </div>
            <Activity size={20} aria-hidden="true" />
          </div>
          <p>
            {googleHealth.connected
              ? `${googleHealth.fitbit_sensor_points.toLocaleString("es-ES")} muestras del sensor Fitbit desde que se activó. ${googleHealth.consolidated_points.toLocaleString("es-ES")} registros adicionales fueron importados o derivados por Google.`
              : "Sueño, HRV, frecuencia cardiaca en reposo, SpO₂, respiración, temperatura, zonas y VO₂ máx."}
          </p>
          <div className="button-row">
            {googleHealth.connected ? (
              <button className="secondary-button" type="button" onClick={syncGoogleHealth} disabled={busy}>
                <RefreshCw size={15} />
                {busy ? "Sincronizando…" : "Actualizar Fitbit"}
              </button>
            ) : (
              <a className="primary-button" href="/api/google-health/connect">Conectar con Google</a>
            )}
          </div>
          {googleHealth.last_sync && (
            <small className="source-meta">Última recepción: {new Date(googleHealth.last_sync.received_at).toLocaleString("es-ES")}</small>
          )}
          {googleHealth.connected && googleHealth.auto_sync && (
            <small className="source-meta auto-sync-meta">
              Automática cada {googleHealth.auto_sync.interval_hours} {googleHealth.auto_sync.interval_hours === 1 ? "hora" : "horas"}
              {googleHealth.auto_sync.next_sync ? ` · Próxima: ${new Date(googleHealth.auto_sync.next_sync).toLocaleString("es-ES")}` : ""}
            </small>
          )}
        </div>
        {message && <p className={error ? "form-message error" : "form-message"}>{message}</p>}
      </section>
    </div>
  );
}
