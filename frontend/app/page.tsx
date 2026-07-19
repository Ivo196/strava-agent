import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HomeCommandCenter } from "@/components/home-command-center";
import { OfflineState } from "@/components/offline-state";
import { getDashboard } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const { today } = await searchParams;
  const simulatedToday = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined;
  const data = await getDashboard(simulatedToday).catch(() => null);
  if (!data) return <OfflineState />;

  const name = data.profile.display_name?.trim();
  const hasTrainingData = data.activity_count > 0;

  return (
    <div className="page-wrap dashboard-page">
      <header className="home-topbar refined-home-topbar">
        <div>
          <span className="eyebrow">PaceOS · Semana {data.next_week?.number ?? "—"}</span>
          <h1>{name ? `Hola, ${name}.` : "Tu entrenamiento de hoy."}</h1>
          <p>{data.metrics.distance_current_week} km esta semana · {data.days_to_race} días para Chicago</p>
        </div>
        <div className={hasTrainingData ? "connection connected" : "connection"}>
          <span />{hasTrainingData ? `${data.activity_count} actividades` : "Historial pendiente"}
        </div>
      </header>

      {!hasTrainingData && (
        <div className="onboarding-banner">
          <div><strong>Conecta tus datos para empezar</strong><span>Apple Health es la fuente principal; también puedes importar un archivo histórico.</span></div>
          <Link href="/settings">Importar historial <ArrowRight size={16} /></Link>
        </div>
      )}

      <HomeCommandCenter data={data} />
    </div>
  );
}
