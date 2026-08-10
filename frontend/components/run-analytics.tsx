"use client";

import { useState } from "react";
import { ChartNoAxesColumnIncreasing, HeartPulse } from "lucide-react";
import { AerobicTrendChart } from "@/components/aerobic-trend-chart";
import { WeeklyMileageChart } from "@/components/weekly-mileage-chart";
import type { Activity, RunProgressData } from "@/lib/types";

type AnalyticsView = "volume" | "aerobic";

export function RunAnalytics({ activities, progress }: { activities: Activity[]; progress: RunProgressData }) {
  const [view, setView] = useState<AnalyticsView>("volume");

  return (
    <section className="run-analytics-section" aria-labelledby="run-analytics-title">
      <h2 className="sr-only" id="run-analytics-title">Análisis de carreras</h2>
      <div className="run-analytics-toolbar">
        <span>Vista</span>
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
            Semanas
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
      </div>

      <div
        aria-labelledby={`run-analytics-${view}-tab`}
        className="run-analytics-panel"
        id={`run-analytics-${view}`}
        role="tabpanel"
      >
        {view === "volume"
          ? <WeeklyMileageChart activities={activities} progress={progress} />
          : <AerobicTrendChart aerobic={progress.aerobic} />}
      </div>
    </section>
  );
}
