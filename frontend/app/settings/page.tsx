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
        <span className="eyebrow">Configuración</span>
        <h1>Tu perfil y tus datos.</h1>
        <p>Sin ruido: solo la información necesaria para entrenarte mejor.</p>
      </header>
      <SettingsForm profile={data.profile} />
    </div>
  );
}
