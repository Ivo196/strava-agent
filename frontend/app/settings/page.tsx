import { OfflineState } from "@/components/offline-state";
import { SettingsForm } from "@/components/settings-form";
import { getGoogleHealthStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const googleHealth = await getGoogleHealthStatus().catch(() => null);
  if (!googleHealth) return <OfflineState />;
  return (
    <div className="page-wrap">
      <header className="simple-header">
        <span className="eyebrow">Chicago 2026 · Sincronización</span>
        <h1>Fuentes y preferencias.</h1>
        <p>Estado de las fuentes que alimentan entrenamientos y recuperación.</p>
      </header>
      <SettingsForm googleHealth={googleHealth} />
    </div>
  );
}
