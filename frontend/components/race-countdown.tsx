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
      <span className="race-countdown-value"><strong key={formatted}>{formatted}</strong></span>
      <small><i />{label}</small>
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
  const progressPercentage = Math.round(remaining.progress * 100);

  return (
    <aside className="race-countdown" aria-labelledby="race-countdown-title">
      <svg className="race-countdown-skyline" viewBox="0 0 780 150" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 150V124h28v-18h21v18h17V90h20v34h23V71h13v53h22V98h25v26h18V84h19v40h22V65h12V39h5V17h5v22h12v26h11v59h25V93h18v31h19V76h15v48h25V105h28v19h22V48h10v76h17V91h19v33h28V81h22v43h19V99h25v25h21V73h17v51h27V108h22v16h26V87h20v37h22v-20h28v20h25v-31h22v31h29V76h18v48h26V98h24v26h31v26Z" />
      </svg>

      <header className="race-countdown-heading">
        <span className="race-countdown-icon" aria-hidden="true"><Flag size={22} /></span>
        <span className="race-countdown-title">
          <small><i />Cuenta atrás en vivo</small>
          <strong id="race-countdown-title">Chicago <b>2026</b></strong>
          <span>Tu línea de salida está cada vez más cerca.</span>
        </span>
        <time dateTime={`${raceDate}T07:30:00-05:00`}><span>{raceDateLabel}</span><b>07:30 CDT</b></time>
      </header>

      <div className="race-countdown-live" role="timer" aria-label={`Faltan ${accessibleTime} para el Maratón de Chicago`}>
        <CountdownUnit label="Días" value={remaining.days} />
        <CountdownUnit label="Horas" value={remaining.hours} />
        <CountdownUnit label="Min" value={remaining.minutes} />
        <CountdownUnit label="Seg" value={remaining.seconds} />
      </div>

      <div
        className="race-countdown-course"
        role="progressbar"
        aria-label="Progreso del plan rumbo a Grant Park"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercentage}
      >
        <div className="race-countdown-course-heading">
          <span><b>42,2 km</b> · rumbo a Grant Park</span>
          <small><b>{progressPercentage}%</b> del plan recorrido</small>
        </div>
        <div className="race-countdown-track" aria-hidden="true">
          <i className="race-countdown-track-fill" style={{ transform: `scaleX(${remaining.progress})` }} />
          <span className="race-countdown-today" style={{ left: `${progressPercentage}%` }}><small>Hoy</small><b /></span>
          <span className="race-countdown-finish"><Flag size={12} /></span>
        </div>
        <div className="race-countdown-course-dates" aria-hidden="true"><span>20 jul · inicio</span><span>11 oct · carrera</span></div>
      </div>
    </aside>
  );
}
