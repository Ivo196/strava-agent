"use client";

import { Flag } from "lucide-react";
import { useEffect, useState } from "react";
import { localNow } from "@/lib/local-clock";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PLAN_START_MS = Date.UTC(2026, 6, 20, 12, 0);
const fullDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

type TimeRemaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  progress: number;
};

function raceStartMs(raceDate: string) {
  const [year, month, day] = raceDate.split("-").map(Number);
  // The official countdown targets 07:30 in Chicago (CDT, UTC-5).
  return Date.UTC(year, month - 1, day, 12, 30);
}

function timeUntil(raceDate: string, now = localNow()): TimeRemaining {
  const target = raceStartMs(raceDate);
  const difference = Math.max(target - now.getTime(), 0);
  const totalJourney = target - PLAN_START_MS;
  const elapsed = Math.max(now.getTime() - PLAN_START_MS, 0);

  return {
    days: Math.floor(difference / DAY_MS),
    hours: Math.floor((difference % DAY_MS) / HOUR_MS),
    minutes: Math.floor((difference % HOUR_MS) / MINUTE_MS),
    seconds: Math.floor((difference % MINUTE_MS) / SECOND_MS),
    progress: Math.min(Math.max(elapsed / totalJourney, 0), 1),
  };
}

function CountdownUnit({ label, value }: { label: string; value: number }) {
  const formatted = String(value).padStart(2, "0");
  return (
    <span className="race-countdown-unit" aria-hidden="true">
      <strong key={formatted}>{formatted}</strong>
      <small>{label}</small>
    </span>
  );
}

export function RaceCountdown({ raceDate, initialDays }: { raceDate: string; initialDays: number }) {
  const [remaining, setRemaining] = useState<TimeRemaining>({
    days: initialDays,
    hours: 0,
    minutes: 0,
    seconds: 0,
    progress: 0,
  });

  useEffect(() => {
    const refresh = () => setRemaining(timeUntil(raceDate));
    refresh();
    const timer = window.setInterval(refresh, SECOND_MS);
    return () => window.clearInterval(timer);
  }, [raceDate]);

  const raceDateLabel = fullDate.format(new Date(`${raceDate}T00:00:00Z`));
  const accessibleTime = `${remaining.days} días, ${remaining.hours} horas, ${remaining.minutes} minutos y ${remaining.seconds} segundos`;

  return (
    <aside className="race-countdown" aria-labelledby="race-countdown-title">
      <header className="race-countdown-heading">
        <span className="race-countdown-icon" aria-hidden="true"><Flag size={20} /></span>
        <span>
          <small>Tu línea de salida está en</small>
          <strong id="race-countdown-title">Chicago 2026</strong>
        </span>
        <time dateTime={`${raceDate}T07:30:00-05:00`}>{raceDateLabel}<b> · 07:30 CDT</b></time>
      </header>

      <div className="race-countdown-live" role="timer" aria-label={`Faltan ${accessibleTime} para el Maratón de Chicago`}>
        <CountdownUnit label="Días" value={remaining.days} />
        <CountdownUnit label="Horas" value={remaining.hours} />
        <CountdownUnit label="Min" value={remaining.minutes} />
        <CountdownUnit label="Seg" value={remaining.seconds} />
      </div>

      <div className="race-countdown-course" aria-hidden="true">
        <small>Plan</small>
        <span><i style={{ transform: `scaleX(${remaining.progress})` }} /><b /></span>
        <small>Grant Park</small>
      </div>
    </aside>
  );
}
