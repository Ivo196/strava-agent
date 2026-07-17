import { CoachSession } from "@/components/coach-session";
import { OfflineState } from "@/components/offline-state";
import { getCoachStatus, getDashboard } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const [data, status] = await Promise.all([
    getDashboard().catch(() => null),
    getCoachStatus().catch(() => null),
  ]);
  if (!data || !status) return <OfflineState />;

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
        weekKm={data.metrics.distance_current_week}
        averageKm={data.metrics.average_weekly_28d}
        longestKm={data.metrics.longest_42d}
        weightKg={data.profile.weight_kg}
      />
    </div>
  );
}
