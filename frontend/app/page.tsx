import Link from "next/link";
import { ArrowRight, Flag, FlaskConical, X } from "lucide-react";
import { HomeCommandCenter } from "@/components/home-command-center";
import { OfflineState } from "@/components/offline-state";
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
      <header className="pulse-page-header">
        <div>
          <span className="eyebrow">PaceOS · Tu plan diario</span>
          <h1>{name ? `Hola, ${name}.` : "Tu día empieza aquí."}</h1>
          <p>Primero, lo que toca hoy.</p>
        </div>
        <div className="pulse-race-chip" aria-label={`${data.days_to_race} días para el Maratón de Chicago`}>
          <Flag size={18} />
          <span><strong>{data.days_to_race}</strong> días para Chicago</span>
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
