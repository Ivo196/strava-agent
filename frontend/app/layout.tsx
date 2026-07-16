import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chicago Marathon Coach",
  description: "Tu preparación para Chicago, guiada por datos reales de Strava.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
