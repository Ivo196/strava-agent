import { OfflineState } from "@/components/offline-state";
import { RecoveryDashboard } from "@/components/recovery-dashboard";
import { getDashboard } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SleepPage() {
  const data = await getDashboard().catch(() => null);
  if (!data) return <OfflineState />;
  return <RecoveryDashboard data={data} />;
}
