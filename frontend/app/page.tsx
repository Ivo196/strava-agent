import Link from "next/link";
import { ArrowRight, FlaskConical, X } from "lucide-react";
import { HomeCommandCenter } from "@/components/home-command-center";
import { OfflineState } from "@/components/offline-state";
import { RaceCountdown } from "@/components/race-countdown";
import { getDashboard } from "@/lib/api";

export const dynamic = "force-dynamic";

const scenarios = [
  { id: "recovered", label: "Recuperado" },
  { id: "sleep-debt", label: "Poco sueño" },
  { id: "heavy-load", label: "Carga alta" },
  { id: "calibrating", label: "Calibrando" },
] as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ today?: string; scenario?: string }> }) {
  const { today, scenario } = await searchParams;
  const simulatedToday = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined;
  const simulatedScenario = scenarios.some((item) => item.id === scenario) ? scenario : undefined;
  const data = await getDashboard(simulatedToday, simulatedScenario).catch(() => null);
  if (!data) return <OfflineState />;

  const name = data.profile.display_name?.trim();
  const hasTrainingData = data.activity_count > 0;

  return (
    <div className="page-wrap dashboard-page">
      <header className="home-topbar refined-home-topbar">
        <div>
          <span className="eyebrow">PaceOS · Semana {data.next_week?.number ?? "—"}</span>
          <h1>{name ? `Hola, ${name}.` : "Tu entrenamiento de hoy."}</h1>
          <p>{data.metrics.distance_current_week} km esta semana</p>
          <RaceCountdown raceDate={data.race_date} initialDays={data.days_to_race} />
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

      {data.demo_scenario && (
        <aside className="pace-qa-bar" aria-label="Escenarios de prueba">
          <div>
            <FlaskConical size={18} />
            <span><strong>Vista de prueba</strong> Datos simulados, sin tocar tu historial.</span>
          </div>
          <nav aria-label="Cambiar escenario simulado">
            {scenarios.map((item) => (
              <Link
                className={item.id === data.demo_scenario ? "active" : ""}
                href={`/?scenario=${item.id}`}
                key={item.id}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link className="pace-qa-close" href="/" aria-label="Volver a los datos reales">
            <X size={17} /> Datos reales
          </Link>
        </aside>
      )}

      <HomeCommandCenter data={data} />
    </div>
  );
}
