"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, CalendarDays, ChartNoAxesColumnIncreasing, Settings, Sparkles } from "lucide-react";
import { LiveDataRefresh } from "@/components/live-data-refresh";
import { ChicagoMark } from "@/components/chicago-mark";
import { localNow } from "@/lib/local-clock";

const navigation = [
  { href: "/", label: "Hoy", icon: ChartNoAxesColumnIncreasing },
  { href: "/plan", label: "Plan Chicago", mobileLabel: "Plan", icon: CalendarDays },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/activities", label: "Carreras", icon: Activity },
  { href: "/settings", label: "Fuentes", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [today, setToday] = useState("");
  useEffect(() => {
    const refreshDate = () => setToday(new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(localNow()));
    refreshDate();
    const timer = window.setInterval(refreshDate, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="PaceOS Chicago 26.2">
          <ChicagoMark />
          <span><strong>PaceOS</strong><small>Chicago 26.2</small></span>
        </Link>
        <nav className="side-nav" aria-label="Navegación principal">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link className={active ? "nav-link active" : "nav-link"} href={href} key={href}>
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-today">
          <span>Hoy</span>
          <strong>{today || "Actualizando fecha…"}</strong>
          <small>Sistema métrico internacional.</small>
        </div>
        <LiveDataRefresh />
      </aside>
      <main className="main-content">{children}</main>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navigation.map(({ href, label, mobileLabel, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link className={active ? "mobile-link active" : "mobile-link"} href={href} key={href}>
              <Icon size={19} aria-hidden="true" />
              <span>{mobileLabel ?? label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
