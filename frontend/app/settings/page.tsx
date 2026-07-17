import { OfflineState } from "@/components/offline-state";
import { SettingsForm } from "@/components/settings-form";
import { getDashboard } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getDashboard().catch(() => null);
  if (!data) return <OfflineState />;
  return (
    <div className="page-wrap">
      <header className="simple-header">
        <span className="eyebrow">Data center</span>
        <h1>Datos y preferencias.</h1>
        <p>Fuentes, unidades y contexto deportivo usados por PaceOS.</p>
      </header>
      <SettingsForm profile={data.profile} />
    </div>
  );
}
