"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, CircleDashed, Footprints, HeartPulse, House, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LiveDataRefresh } from "@/components/live-data-refresh";
import { ChicagoMark } from "@/components/chicago-mark";
import { localNow } from "@/lib/local-clock";

type NavigationItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  mobile?: boolean;
  icon: LucideIcon;
};

const navigation: NavigationItem[] = [
  { href: "/", label: "Hoy", icon: House },
  { href: "/plan", label: "Calendario", icon: CalendarDays },
  { href: "/activities", label: "Carreras", icon: Footprints },
  { href: "/sleep", label: "Recuperación", mobileLabel: "Recuperar", icon: HeartPulse },
  { href: "/coach", label: "Coach", icon: CircleDashed },
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
        <Link className={pathname.startsWith("/settings") ? "nav-link nav-settings active" : "nav-link nav-settings"} href="/settings">
          <Settings size={19} strokeWidth={1.8} aria-hidden="true" />
          Ajustes
        </Link>
        <div className="sidebar-today">
          <span>Hoy</span>
          <strong>{today || "Actualizando fecha…"}</strong>
        </div>
        <LiveDataRefresh />
      </aside>
      <main className="main-content">{children}</main>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navigation.filter((item) => item.mobile !== false).map(({ href, label, mobileLabel, icon: Icon }) => {
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
