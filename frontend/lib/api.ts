import type { Activity, ActivityDetail, CoachStatus, CoachSummary, DashboardData, GoogleHealthStatus, PlanData, Profile } from "./types";

export const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<T>;
}

function withToday(path: string, today?: string) {
  return today ? `${path}?today=${encodeURIComponent(today)}` : path;
}

export function getDashboard(today?: string) {
  return apiGet<DashboardData>(withToday("/api/dashboard", today));
}

export function getActivities() {
  return apiGet<{ activities: Activity[] }>("/api/activities");
}

export function getActivityDetail(id: string) {
  return apiGet<ActivityDetail>(`/api/activities/${id}`);
}

export function getPlan(today?: string) {
  return apiGet<PlanData>(withToday("/api/plan", today));
}

export function getProfile() {
  return apiGet<Profile>("/api/profile");
}

export function getCoachStatus() {
  return apiGet<CoachStatus>("/api/coach/status");
}

export function getCoachSummary() {
  return apiGet<CoachSummary>("/api/coach/summary");
}

export function getGoogleHealthStatus() {
  return apiGet<GoogleHealthStatus>("/api/google-health/status");
}
