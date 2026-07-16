export type Profile = {
  display_name: string;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  resting_hr: number | null;
  max_hr: number | null;
  running_days: number;
  goal_time_minutes: number | null;
  goal_pace_seconds_km: number | null;
  injury_notes: string;
  training_notes: string;
};

export type Activity = {
  id: number;
  name: string;
  date: string;
  distance_km: number;
  moving_minutes?: number;
  pace: string;
  average_heartrate: number | null;
  elevation_gain_m?: number;
  training_load?: number;
};

export type ActivitySeriesPoint = {
  distance_km: number;
  pace_min_km: number | null;
  heartrate: number | null;
  altitude_m: number | null;
};

export type ActivitySplit = {
  kilometer: number;
  label: string;
  distance_km: number;
  pace: string;
  pace_seconds: number;
  average_heartrate: number | null;
  elevation_gain_m: number;
};

export type ActivityDetail = {
  activity: Activity & {
    moving_time: string;
    moving_time_seconds: number;
    max_heartrate: number | null;
    calories: number | null;
  };
  streams_available: boolean;
  series: ActivitySeriesPoint[];
  splits: ActivitySplit[];
};

export type TrainingWeek = {
  number: number;
  start: string;
  end: string;
  phase: string;
  target_km: number;
  long_run_km: number;
  sessions: string[];
  session_objectives: string[];
  strength_recommendation: string;
  bike_recommendation: string;
  risk_level: "Bajo" | "Moderado" | "Alto";
  change_reason: string;
  goal_status: "Respaldado" | "Dudoso" | "No respaldado";
  actual_km: number | null;
  completion_percentage: number | null;
};

export type DashboardData = {
  activity_count: number;
  days_to_race: number;
  race_date: string;
  profile: Profile;
  metrics: {
    distance_current_week: number;
    runs_current_week: number;
    distance_7d: number;
    distance_28d: number;
    runs_28d: number;
    longest_42d: number;
    load_7d: number;
    load_previous_7d: number;
    average_weekly_28d: number;
    hr_coverage: number;
  };
  readiness: { status: string; notes: string[] };
  weeks: { week: string; distance_km: number; training_load: number; runs: number }[];
  recent_activities: Activity[];
  next_week: TrainingWeek | null;
  upcoming_weeks: TrainingWeek[];
};

export type CoachStatus = {
  configured: boolean;
  model: string;
  privacy: string;
};
