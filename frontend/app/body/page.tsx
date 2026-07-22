import Link from "next/link";
import { Settings } from "lucide-react";
import { BodyCompositionView } from "@/components/body-composition-view";
import { OfflineState } from "@/components/offline-state";
import { getBodyComposition } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function BodyCompositionPage() {
  const data = await getBodyComposition().catch(() => null);
  if (!data) return <OfflineState />;

  return (
    <div className="page-wrap body-page">
      <header className="simple-header body-header">
        <div>
          <span className="eyebrow">Chicago 2026 · Evolución corporal</span>
          <h1>Composición corporal.</h1>
          <p>Peso, masa muscular y grasa corporal medidos en las mismas condiciones a lo largo del tiempo.</p>
        </div>
        <Link className="secondary-button" href="/settings"><Settings size={16} /> Administrar fuentes</Link>
      </header>
      <BodyCompositionView data={data} />
    </div>
  );
}
