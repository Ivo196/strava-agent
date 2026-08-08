"use client";

import { useState } from "react";
import { ChartNoAxesColumnIncreasing, HeartPulse } from "lucide-react";
import { AerobicTrendChart } from "@/components/aerobic-trend-chart";
import { WeeklyMileageChart } from "@/components/weekly-mileage-chart";
import type { RunProgressData } from "@/lib/types";

type AnalyticsView = "volume" | "aerobic";

export function RunAnalytics({ progress }: { progress: RunProgressData }) {
  const [view, setView] = useState<AnalyticsView>("volume");

  return (
    <section className="run-analytics-section" aria-labelledby="run-analytics-title">
      <header className="run-analytics-header">
        <div>
          <span className="eyebrow">Evolución</span>
          <h2 id="run-analytics-title">Leé una señal a la vez</h2>
          <p>Alterná entre carga semanal y eficiencia aeróbica para ver cada tendencia con espacio suficiente.</p>
        </div>
        <div className="run-analytics-tabs" aria-label="Elegir gráfico de carreras" role="tablist">
          <button
            aria-controls="run-analytics-volume"
            aria-selected={view === "volume"}
            className={view === "volume" ? "active" : ""}
            id="run-analytics-volume-tab"
            onClick={() => setView("volume")}
            role="tab"
            type="button"
          >
            <ChartNoAxesColumnIncreasing aria-hidden="true" size={17} />
            Volumen
          </button>
          <button
            aria-controls="run-analytics-aerobic"
            aria-selected={view === "aerobic"}
            className={view === "aerobic" ? "active" : ""}
            id="run-analytics-aerobic-tab"
            onClick={() => setView("aerobic")}
            role="tab"
            type="button"
          >
            <HeartPulse aria-hidden="true" size={17} />
            Ritmo y pulso
          </button>
        </div>
      </header>

      <div
        aria-labelledby={`run-analytics-${view}-tab`}
        className="run-analytics-panel"
        id={`run-analytics-${view}`}
        role="tabpanel"
      >
        {view === "volume"
          ? <WeeklyMileageChart weekly={progress.weekly} />
          : <AerobicTrendChart aerobic={progress.aerobic} />}
      </div>
    </section>
  );
}
