"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Bike,
  CalendarCheck2,
  Dumbbell,
  Footprints,
  MoonStar,
} from "lucide-react";
import type { DailyAgendaItem } from "@/lib/types";

const weekday = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  timeZone: "Europe/Paris",
});

function icon(category: DailyAgendaItem["category"], size = 18) {
  if (category === "run") return <Footprints size={size} />;
  if (category === "strength") return <Dumbbell size={size} />;
  if (category === "bike") return <Bike size={size} />;
  return <MoonStar size={size} />;
}

function label(category: DailyAgendaItem["category"]) {
  if (category === "run") return "Carrera";
  if (category === "strength") return "Fuerza";
  if (category === "bike") return "Bicicleta";
  return "Recuperación";
}

export function InteractiveWeek({ agenda }: { agenda: DailyAgendaItem[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = agenda[selectedIndex] ?? agenda[0];

  if (!selected) return null;

  return (
    <div className="pace-week-explorer">
      <div className={`pace-day-detail category-${selected.category}`} key={selected.date} aria-live="polite">
        <span className="pace-day-detail-icon">{icon(selected.category, 22)}</span>
        <div>
          <small>{selected.relative_label} · {label(selected.category)}</small>
          <strong>{selected.title}</strong>
          <p>{selected.detail}</p>
        </div>
        <Link href="/plan">
          Ver en el plan <ArrowRight size={16} />
        </Link>
      </div>

      <div className="pace-calendar-strip" aria-label="Explorar los próximos siete días">
        {agenda.map((item, index) => (
          <button
            aria-label={`${item.relative_label}: ${item.title}`}
            aria-pressed={index === selectedIndex}
            className={`pace-calendar-day category-${item.category}${index === 0 ? " is-today" : ""}${index === selectedIndex ? " is-selected" : ""}`}
            key={item.date}
            onClick={() => setSelectedIndex(index)}
            type="button"
          >
            <div>
              <span>{weekday.format(new Date(`${item.date}T12:00:00+02:00`))}</span>
              <strong>{new Date(`${item.date}T12:00:00+02:00`).getDate()}</strong>
            </div>
            <i>{icon(item.category)}</i>
            <small>{label(item.category)}</small>
            <p>{item.title}</p>
            {index === 0 && <b><CalendarCheck2 size={11} /> Hoy</b>}
          </button>
        ))}
      </div>
    </div>
  );
}
