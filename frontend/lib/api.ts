import type { Activity, ActivityDetail, CoachStatus, DashboardData, GoogleHealthStatus, Profile, TrainingWeek } from "./types";

export const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<T>;
}

export function getDashboard() {
  return apiGet<DashboardData>("/api/dashboard");
}

export function getActivities() {
  return apiGet<{ activities: Activity[] }>("/api/activities");
}

export function getActivityDetail(id: number) {
  return apiGet<ActivityDetail>(`/api/activities/${id}`);
}

export function getPlan() {
  return apiGet<{ fixed: boolean; policy: string; weeks: TrainingWeek[] }>("/api/plan");
}

export function getProfile() {
  return apiGet<Profile>("/api/profile");
}

export function getCoachStatus() {
  return apiGet<CoachStatus>("/api/coach/status");
}

export function getGoogleHealthStatus() {
  return apiGet<GoogleHealthStatus>("/api/google-health/status");
}
