import { CoachSession } from "@/components/coach-session";
import { OfflineState } from "@/components/offline-state";
import { getCoachStatus, getCoachSummary } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const [summary, status] = await Promise.all([
    getCoachSummary().catch(() => null),
    getCoachStatus().catch(() => null),
  ]);
  if (!summary || !status) return <OfflineState />;

  return (
    <div className="page-wrap">
      <header className="simple-header">
        <span className="eyebrow">Adaptive intelligence</span>
        <h1>PaceOS Coach.</h1>
        <p>Analiza cómo vas, qué estás haciendo bien y qué puedes mejorar sin reescribir el plan fijo.</p>
      </header>
      <CoachSession
        configured={status.configured}
        model={status.model}
        privacy={status.privacy}
        weekKm={summary.metrics.distance_current_week}
        averageKm={summary.metrics.average_weekly_28d}
        longestKm={summary.metrics.longest_42d}
        weightKg={summary.profile.weight_kg}
        goalPaceSeconds={summary.profile.goal_pace_seconds_km}
      />
    </div>
  );
}
