import type { Activity, ActivityDetail, CoachStatus, CoachSummary, DashboardData, GoogleHealthStatus, PlanData, Profile } from "./types";

export const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

async function apiGet<T>(path: string, revalidate: number): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    next: { revalidate, tags: ["training-data"] },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<T>;
}

function withToday(path: string, today?: string) {
  return today ? `${path}?today=${encodeURIComponent(today)}` : path;
}

export function getDashboard(today?: string) {
  return apiGet<DashboardData>(withToday("/api/dashboard", today), 60);
}

export function getActivities() {
  return apiGet<{ activities: Activity[] }>("/api/activities", 5 * 60);
}

export function getActivityDetail(id: string) {
  return apiGet<ActivityDetail>(`/api/activities/${id}`, 5 * 60);
}

export function getPlan(today?: string) {
  return apiGet<PlanData>(withToday("/api/plan", today), 5 * 60);
}

export function getProfile() {
  return apiGet<Profile>("/api/profile", 5 * 60);
}

export function getCoachStatus() {
  return apiGet<CoachStatus>("/api/coach/status", 5 * 60);
}

export function getCoachSummary() {
  return apiGet<CoachSummary>("/api/coach/summary", 60);
}

export function getGoogleHealthStatus() {
  return apiGet<GoogleHealthStatus>("/api/google-health/status", 0);
}
