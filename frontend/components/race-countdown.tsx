"use client";

import { Flag } from "lucide-react";
import { useEffect, useState } from "react";
import { localNow } from "@/lib/local-clock";

const DAY_MS = 24 * 60 * 60 * 1000;
const fullDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function daysUntil(raceDate: string, now = localNow()) {
  const [year, month, day] = raceDate.split("-").map(Number);
  const raceDay = Date.UTC(year, month - 1, day);
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(Math.round((raceDay - currentDay) / DAY_MS), 0);
}

export function RaceCountdown({ raceDate, initialDays }: { raceDate: string; initialDays: number }) {
  const [days, setDays] = useState(initialDays);

  useEffect(() => {
    let timer: number;

    const refreshAtMidnight = () => {
      const now = localNow();
      setDays(daysUntil(raceDate, now));
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(refreshAtMidnight, nextMidnight.getTime() - now.getTime() + 1_000);
    };

    refreshAtMidnight();
    return () => window.clearTimeout(timer);
  }, [raceDate]);

  const dayLabel = days === 1 ? "día" : "días";
  const raceDateLabel = fullDate.format(new Date(`${raceDate}T00:00:00Z`));

  return (
    <aside className="race-countdown" aria-label={`Faltan ${days} ${dayLabel} para el Maratón de Chicago`}>
      <span className="race-countdown-icon" aria-hidden="true"><Flag size={18} /></span>
      <span className="race-countdown-copy">
        <small>Maratón de Chicago</small>
        <strong><b>{days}</b> {dayLabel}</strong>
        <time dateTime={raceDate}>{raceDateLabel}</time>
      </span>
    </aside>
  );
}
