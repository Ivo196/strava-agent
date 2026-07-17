"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { localNow } from "@/lib/local-clock";

const formatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function LiveDateBadge() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const refresh = () => setLabel(formatter.format(localNow()));
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return <span className="live-date-badge"><CalendarClock size={14} />Hoy · {label || "actualizando…"}</span>;
}
