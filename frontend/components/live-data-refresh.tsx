"use client";

import { RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const VERSION_CHECK_INTERVAL_MS = 60 * 1000;

export function LiveDataRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const versionRef = useRef<string | null>(null);
  const checkLocked = useRef(false);

  useEffect(() => {
    let mounted = true;

    const checkForChanges = async () => {
      if (checkLocked.current || document.visibilityState !== "visible") return;
      checkLocked.current = true;
      try {
        const response = await fetch("/api/backend/data-version", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { version?: string };
        if (!mounted || !payload.version) return;
        const previous = versionRef.current;
        versionRef.current = payload.version;
        setLastCheck(new Date());
        if (previous !== null && previous !== payload.version) {
          await fetch("/api/revalidate-training", { method: "POST" });
          if (!mounted) return;
          startRefresh(() => router.refresh());
        }
      } finally {
        checkLocked.current = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void checkForChanges();
    };

    void checkForChanges();
    const timer = window.setInterval(checkForChanges, VERSION_CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkForChanges);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      checkLocked.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkForChanges);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router]);

  if (pathname !== "/") return null;

  return (
    <div className={refreshing ? "live-refresh live-refresh-active" : "live-refresh"} aria-live="polite">
      <RefreshCw size={13} aria-hidden="true" />
      <span>{refreshing ? "Actualizando" : "Datos sincronizados"}</span>
      <small>{lastCheck ? lastCheck.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—"}</small>
    </div>
  );
}
