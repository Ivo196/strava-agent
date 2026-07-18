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

export type ActivityRoutePoint = {
  latitude: number;
  longitude: number;
};

export type ActivityDetail = {
  activity: Activity & {
    moving_time: string;
    moving_time_seconds: number;
    max_heartrate: number | null;
    calories: number | null;
  };
  streams_available: boolean;
  route_available: boolean;
  route: ActivityRoutePoint[];
  running_dynamics_available: boolean;
  running_dynamics: RunningDynamicsPoint[];
  running_dynamics_summary: Partial<Omit<RunningDynamicsPoint, "elapsed_min">>;
  series: ActivitySeriesPoint[];
  splits: ActivitySplit[];
};

export type RunningDynamicsPoint = {
  elapsed_min: number;
  power_w?: number;
  speed_kmh?: number;
  ground_contact_ms?: number;
  stride_m?: number;
  vertical_oscillation_cm?: number;
};

export type RecoveryMetric = {
  value: number;
  unit: string;
  date: string;
} | null;

export type DeviceMetric = {
  value: number;
  unit: string;
  date: string;
  method?: string;
} | null;

export type DeviceInsights = {
  apple_watch: {
    status: string;
    last_sync: string | null;
    workouts: number;
    week: {
      distance_km: number;
      runs: number;
    };
    latest_run: {
      id: number;
      date: string;
      distance_km: number;
      pace: string;
      average_heartrate: number | null;
      dynamics: {
        power_w?: number;
        speed_kmh?: number;
        ground_contact_ms?: number;
        stride_m?: number;
        vertical_oscillation_cm?: number;
      };
    } | null;
    recovery: {
      hrv: RecoveryMetric;
      resting_hr: RecoveryMetric;
      vo2_max: RecoveryMetric;
      sleep: RecoveryMetric;
      weight: RecoveryMetric;
    };
  };
  fitbit: {
    status: string;
    first_seen: string | null;
    last_seen: string | null;
    sensor_samples: number;
    heart_rate: {
      date: string | null;
      latest: number | null;
      average: number | null;
      minimum: number | null;
      maximum: number | null;
      coverage_hours: number;
      series: { time: string; bpm: number }[];
    };
    recovery: {
      hrv: DeviceMetric;
      resting_hr: DeviceMetric;
      oxygen: DeviceMetric;
      respiratory_rate: DeviceMetric;
      temperature: DeviceMetric;
      vo2_max: DeviceMetric;
      sleep: DeviceMetric;
    };
  };
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

export type DailyAgendaItem = {
  date: string;
  day: string;
  relative_label: string;
  category: "run" | "strength" | "bike" | "rest";
  title: string;
  detail: string;
  week_number: number;
  phase: string;
  week_target_km: number;
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
  devices: DeviceInsights;
  recovery: {
    hrv: RecoveryMetric;
    resting_hr: RecoveryMetric;
    vo2_max: RecoveryMetric;
    sleep: RecoveryMetric;
    weight: RecoveryMetric;
  };
  weeks: { week: string; distance_km: number; training_load: number; runs: number }[];
  recent_activities: Activity[];
  next_week: TrainingWeek | null;
  upcoming_weeks: TrainingWeek[];
  daily_agenda: DailyAgendaItem[];
};

export type CoachStatus = {
  configured: boolean;
  model: string;
  privacy: string;
};

export type GoogleHealthStatus = {
  configured: boolean;
  connected: boolean;
  point_count: number;
  fitbit_sensor_points: number;
  fitbit_sensor_first: string | null;
  fitbit_sensor_last: string | null;
  consolidated_points: number;
  last_sync: {
    received_at: string;
    points_received: number;
    data_types_received: number;
    errors: string[];
  } | null;
  auto_sync: {
    enabled: boolean;
    interval_hours: number;
    next_sync: string | null;
    running: boolean;
    last_attempt: string | null;
    last_error: string | null;
  };
  data_types: {
    data_type: string;
    count: number;
    latest: string | null;
  }[];
};
