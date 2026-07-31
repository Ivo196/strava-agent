import type { CSSProperties, ReactNode } from "react";
import { Activity, BedDouble, Clock3, Droplets, Gauge, HeartPulse, MoonStar, Thermometer, Wind, Zap } from "lucide-react";
import { MetricTrend } from "@/components/metric-trend";
import { OfflineState } from "@/components/offline-state";
import { getDashboard } from "@/lib/api";
import type { DashboardData, DeviceMetric } from "@/lib/types";

export const dynamic = "force-dynamic";

type GaugeTone = "good" | "balanced" | "warning" | "bad" | "neutral";

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function metricValue(metric: DeviceMetric) {
  if (!metric) return "—";
  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function positiveState(score: number | null): { tone: GaugeTone; label: string } {
  if (score == null) return { tone: "neutral", label: "Sin lectura" };
  if (score >= 70) return { tone: "good", label: "Óptimo" };
  if (score >= 45) return { tone: "balanced", label: "Estable" };
  return { tone: "bad", label: "Atención" };
}

function stressState(score: number | null): { tone: GaugeTone; label: string } {
  if (score == null) return { tone: "neutral", label: "Sin lectura" };
  if (score < 30) return { tone: "good", label: "Bajo" };
  if (score < 65) return { tone: "warning", label: "Moderado" };
  return { tone: "bad", label: "Alto" };
}

function RecoveryGauge({
  label,
  value,
  unit,
  score,
  tone,
  status,
  detail,
  icon,
  scale = ["Bajo", "Bien", "Óptimo"],
}: {
  label: string;
  value: string | number;
  unit?: string;
  score: number | null;
  tone: GaugeTone;
  status: string;
  detail: string;
  icon: ReactNode;
  scale?: [string, string, string];
}) {
  const percent = score == null ? 0 : clamp(score);
  return (
    <article className={`recovery-gauge-card gauge-${tone}`}>
      <header><span>{icon}{label}</span><strong>{status}</strong></header>
      <div
        className="recovery-dial"
        style={{ "--dial-value": `${percent * 1.8}deg` } as CSSProperties}
        role="progressbar"
        aria-label={`${label}: ${value}${unit ? ` ${unit}` : ""}. Estado ${status}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score == null ? undefined : Math.round(percent)}
      >
        <i aria-hidden="true" />
        <div><strong>{value}</strong>{unit && <small>{unit}</small>}</div>
      </div>
      <div className="recovery-gauge-scale" aria-hidden="true"><span>{scale[0]}</span><span>{scale[1]}</span><span>{scale[2]}</span></div>
      <p>{detail}</p>
    </article>
  );
}

function factorIcon(key: DashboardData["daily_state"]["morning_recovery"]["factors"][number]["key"]) {
  if (key === "sleep") return <BedDouble />;
  if (key === "hrv") return <HeartPulse />;
  if (key === "resting_hr") return <Activity />;
  if (key === "respiratory_rate") return <Wind />;
  if (key === "temperature") return <Thermometer />;
  return <Droplets />;
}

export default async function SleepPage() {
  const data = await getDashboard().catch(() => null);
  if (!data) return <OfflineState />;
  const state = data.daily_state;
  const recovery = state.morning_recovery;
  const stress = state.physiological_stress;
  const energy = state.energy;
  const sleep = state.sleep_utility;
  const fitbit = data.devices.fitbit;
  const latest = fitbit.sleep.latest;
  const sleepHours = latest?.hours ?? recovery.sleep_hours ?? sleep.average_hours;
  const sleepPercent = sleepHours == null ? null : clamp((sleepHours / sleep.goal_hours) * 100);
  const recoveryStatus = positiveState(recovery.score);
  const stressStatus = stressState(stress.score);
  const sleepStatus = positiveState(sleepPercent);
  const energyStatus = positiveState(energy.score);
  const sleepTrend = sleep.trend.map((day) => ({ date: day.date, value: day.hours }));
  const hrvTrend = fitbit.recovery_history.filter((day) => day.hrv != null).map((day) => ({ date: day.date, value: day.hrv! }));
  const restingTrend = fitbit.recovery_history.filter((day) => day.resting_hr != null).map((day) => ({ date: day.date, value: day.resting_hr! }));
  const stages = [
    { label: "Profundo", value: latest?.deep_minutes ?? 0, className: "sleep-deep" },
    { label: "REM", value: latest?.rem_minutes ?? 0, className: "sleep-rem" },
    { label: "Ligero", value: latest?.light_minutes ?? 0, className: "sleep-light" },
    { label: "Despierto", value: latest?.awake_minutes ?? 0, className: "sleep-awake" },
  ];
  const stageTotal = stages.reduce((sum, stage) => sum + stage.value, 0);
  const maxStressPoint = Math.max(...stress.timeline.map((point) => point.score), 1);

  return (
    <div className="page-wrap recovery-page recovery-page-v2">
      <header className="simple-header section-page-header recovery-page-head">
        <div>
          <span className="eyebrow">Fitbit · Cálculo automático</span>
          <h1>Recuperación</h1>
          <p>Sueño, estrés y señales vitales comparadas con tu propia base.</p>
        </div>
        <div className="recovery-data-status"><i /><span><strong>{fitbit.status}</strong><small>{stress.confidence} confianza</small></span></div>
      </header>

      <section className="recovery-gauge-grid" aria-label="Indicadores principales de recuperación">
        <RecoveryGauge
          label="Recuperación"
          value={recovery.score ?? "—"}
          unit={recovery.score != null ? "/100" : undefined}
          score={recovery.score}
          tone={recoveryStatus.tone}
          status={recovery.provisional ? "Provisional" : recoveryStatus.label}
          detail={recovery.provisional ? "Se afina al completar siete noches" : recovery.label}
          icon={<HeartPulse size={16} />}
        />
        <RecoveryGauge
          label="Estrés fisiológico"
          value={stress.score ?? "—"}
          unit={stress.score != null ? "/100" : undefined}
          score={stress.score}
          tone={stressStatus.tone}
          status={stressStatus.label}
          detail="Automático · pulso pasivo + noche"
          icon={<Zap size={16} />}
          scale={["Bajo", "Medio", "Alto"]}
        />
        <RecoveryGauge
          label="Sueño"
          value={sleepHours ?? "—"}
          unit={sleepHours != null ? "h" : undefined}
          score={sleepPercent}
          tone={sleepStatus.tone}
          status={sleepStatus.label}
          detail={`${sleep.goal_hours} h objetivo${sleep.debt_hours != null ? ` · ${sleep.debt_hours} h deuda` : ""}`}
          icon={<MoonStar size={16} />}
        />
        <RecoveryGauge
          label="Energía"
          value={energy.score}
          unit="/100"
          score={energy.score}
          tone={energyStatus.tone}
          status={energyStatus.label}
          detail={energy.explanation}
          icon={<Gauge size={16} />}
        />
      </section>

      <section className="recovery-context-grid" aria-label="Detalle de sueño y estrés">
        <article className="night-card night-card-v2">
          <header><span><MoonStar size={16} /> Arquitectura del sueño</span><time>{latest?.date ?? "Sin datos"}</time></header>
          <div className="night-summary-line"><strong>{sleepHours ?? "—"}<small> h</small></strong><span>{latest?.efficiency != null ? `${latest.efficiency}% eficiencia` : "Eficiencia sin dato"}</span></div>
          {stageTotal > 0 ? (
            <>
              <div className="sleep-stage-track" aria-label="Etapas del sueño">
                {stages.map((stage) => <i className={stage.className} key={stage.label} style={{ width: `${(stage.value / stageTotal) * 100}%` }} />)}
              </div>
              <div className="sleep-stage-legend">
                {stages.map((stage) => <span key={stage.label}><i className={stage.className} /><small>{stage.label}</small><strong>{stage.value} min</strong></span>)}
              </div>
            </>
          ) : <p className="recovery-empty-copy">Fitbit todavía no envió las etapas de esta noche.</p>}
          <footer><Clock3 size={15} /><span>{sleep.guidance}</span></footer>
        </article>

        <article className="stress-auto-card">
          <header><div><span><Zap size={16} /> Estrés automático</span><strong>{stress.label}</strong></div><small>{stress.confidence} confianza</small></header>
          <p>{stress.source}</p>
          <div className="stress-component-grid">
            <span><small>Activación reciente</small><strong>{stress.components.daytime_activation ?? "—"}<b>/100</b></strong></span>
            <span><small>Tensión nocturna</small><strong>{stress.components.nightly_strain ?? "—"}<b>/100</b></strong></span>
            <span><small>Pulso pasivo</small><strong>{stress.components.passive_bpm ?? "—"}<b>bpm</b></strong></span>
            <span><small>Cobertura</small><strong>{stress.components.coverage_hours}<b>h</b></strong></span>
          </div>
          {stress.timeline.length > 0 && (
            <div className="stress-mini-chart" aria-label="Activación fisiológica durante el día">
              {stress.timeline.map((point, index) => (
                <i key={`${point.time}-${index}`} style={{ height: `${Math.max(8, (point.score / maxStressPoint) * 100)}%` }} title={`${point.time} · ${point.bpm} bpm · estrés ${point.score}`} />
              ))}
            </div>
          )}
          <footer><span>{stress.method}</span><small>{stress.note}</small></footer>
        </article>
      </section>

      <section className="body-signals body-signals-v2" aria-labelledby="body-signals-title">
        <div className="section-title-line"><div><span className="eyebrow">Señales nocturnas</span><h2 id="body-signals-title">Qué está ayudando o frenando</h2></div><small>Comparación con tu base personal</small></div>
        <div className="signal-gauge-grid">
          {recovery.factors.map((factor) => {
            const status = positiveState(factor.score);
            const progress = factor.score == null ? 0 : clamp(factor.score);
            return (
              <article className={`signal-gauge-card gauge-${status.tone}`} key={factor.key}>
                <header><span>{factorIcon(factor.key)}{factor.label}</span><strong>{status.label}</strong></header>
                <div className="signal-gauge-value"><strong>{factor.value}</strong><span>{factor.score != null ? `${factor.score}/100` : "Sin referencia"}</span></div>
                <div role="progressbar" aria-label={`${factor.label}: ${factor.value}. ${status.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={factor.score ?? undefined}><i style={{ width: `${progress}%` }} /></div>
                <footer><span>{factor.detail}</span>{factor.baseline != null && <small>Base {factor.baseline}</small>}</footer>
              </article>
            );
          })}
        </div>
        <div className="recovery-extra-strip">
          <span><Gauge size={15} /><small>VO₂ máx</small><strong>{metricValue(fitbit.recovery.vo2_max)}</strong></span>
          <span><Activity size={15} /><small>Noches de base</small><strong>{state.calibration.nights}/{state.calibration.required}</strong></span>
          <span><Droplets size={15} /><small>Última lectura</small><strong>{fitbit.last_seen ? "Sincronizada" : "Pendiente"}</strong></span>
        </div>
      </section>

      <section className="recovery-trends" aria-labelledby="recovery-trends-title">
        <div className="section-title-line"><div><span className="eyebrow">Tendencias</span><h2 id="recovery-trends-title">Mira la dirección, no un solo día</h2></div><small>{sleep.nights} noches analizadas</small></div>
        <div className="metric-trend-grid">
          <MetricTrend title="Duración nocturna" unit="h" items={sleepTrend} tone="purple" />
          <MetricTrend title="HRV" unit="ms" items={hrvTrend} tone="cyan" />
          <MetricTrend title="Pulso en reposo" unit="bpm" items={restingTrend} tone="amber" />
        </div>
      </section>
    </div>
  );
}
