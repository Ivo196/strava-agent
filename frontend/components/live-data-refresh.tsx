"use client";

import { RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const REFRESH_INTERVAL_MS = 30 * 1000;

export function LiveDataRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshLocked = useRef(false);

  useEffect(() => {
    if (pathname !== "/") {
      setLastRefresh(null);
      setRefreshing(false);
      refreshLocked.current = false;
      return;
    }

    let mounted = true;

    const refresh = () => {
      if (refreshLocked.current || document.visibilityState !== "visible") return;
      refreshLocked.current = true;
      setRefreshing(true);
      router.refresh();
      if (!mounted) return;
      setLastRefresh(new Date());
      window.setTimeout(() => {
        refreshLocked.current = false;
        if (mounted) setRefreshing(false);
      }, 3000);
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
      refreshLocked.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pathname, router]);

  if (pathname !== "/") return null;

  return (
    <div className={refreshing ? "live-refresh live-refresh-active" : "live-refresh"} aria-live="polite">
      <RefreshCw size={13} aria-hidden="true" />
      <span>{refreshing ? "Actualizando" : "Datos vivos"}</span>
      <small>{lastRefresh ? lastRefresh.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—"}</small>
    </div>
  );
}
