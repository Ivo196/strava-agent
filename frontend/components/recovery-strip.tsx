import { Activity, HeartPulse, Moon, Scale, Wind } from "lucide-react";
import type { DashboardData } from "@/lib/types";

const items = [
  { key: "hrv", label: "HRV · media 7 días", icon: Activity },
  { key: "resting_hr", label: "FC reposo · media 7 días", icon: HeartPulse },
  { key: "vo2_max", label: "VO₂ máx.", icon: Wind },
  { key: "sleep", label: "Último sueño", icon: Moon },
  { key: "weight", label: "Último peso", icon: Scale },
] as const;

export function RecoveryStrip({ recovery }: { recovery: DashboardData["recovery"] }) {
  const visible = items.filter((item) => recovery[item.key]);
  if (!visible.length) return null;

  return (
    <section className="recovery-section" aria-label="Recuperación consolidada">
      <div className="section-heading">
        <div><span className="eyebrow">Salud consolidada</span><h2>Recuperación y capacidad</h2></div>
        <span className="unit-label">últimos siete días</span>
      </div>
      <div className="recovery-strip">
        {visible.map((item) => {
          const metric = recovery[item.key]!;
          const Icon = item.icon;
          return (
            <article key={item.key}>
              <Icon size={16} />
              <span>{item.label}</span>
              <strong>{metric.value}<small> {metric.unit}</small></strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}
