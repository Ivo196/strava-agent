"use client";

import { RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const REFRESH_INTERVAL_MS = 30 * 1000;

export function LiveDataRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;

    const refresh = () => {
      setRefreshing(true);
      router.refresh();
      if (!mounted) return;
      setLastRefresh(new Date());
      window.setTimeout(() => {
        if (mounted) setRefreshing(false);
      }, 650);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    setLastRefresh(new Date());
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pathname, router]);

  return (
    <div className={refreshing ? "live-refresh live-refresh-active" : "live-refresh"} aria-live="polite">
      <RefreshCw size={13} aria-hidden="true" />
      <span>{refreshing ? "Actualizando" : "Datos vivos"}</span>
      <small>{lastRefresh ? lastRefresh.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—"}</small>
    </div>
  );
}
