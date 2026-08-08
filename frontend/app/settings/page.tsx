import { OfflineState } from "@/components/offline-state";
import { SettingsForm } from "@/components/settings-form";
import { getAppleHealthStatus, getGoogleHealthStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [appleHealth, googleHealth] = await Promise.all([
    getAppleHealthStatus().catch(() => null),
    getGoogleHealthStatus().catch(() => null),
  ]);
  if (!appleHealth || !googleHealth) return <OfflineState />;
  return (
    <div className="page-wrap">
      <header className="simple-header">
        <span className="eyebrow">Chicago 2026 · Sincronización</span>
        <h1>Fuentes y preferencias.</h1>
        <p>Estado de las fuentes que alimentan entrenamientos y recuperación.</p>
      </header>
      <SettingsForm appleHealth={appleHealth} googleHealth={googleHealth} />
      <section className="you-links" aria-label="Tus herramientas">
        <Link href="/activities"><Activity size={19} /><span><strong>Carreras</strong><small>Historial y análisis</small></span></Link>
        <Link href="/body"><Scale size={19} /><span><strong>Composición</strong><small>Peso sincronizado</small></span></Link>
        <Link href="/coach"><Sparkles size={19} /><span><strong>Coach</strong><small>Pregunta por tus datos</small></span></Link>
      </section>
    </div>
  );
}
import Link from "next/link";
import { Activity, Scale, Sparkles } from "lucide-react";
