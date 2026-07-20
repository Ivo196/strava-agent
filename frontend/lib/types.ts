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
  id: string;
  name: string;
  date: string;
  distance_km: number;
  moving_minutes?: number;
  pace: string;
  average_heartrate: number | null;
  elevation_gain_m?: number;
  training_load?: number;
  calories?: number | null;
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
  heartrate_source: "stream" | "workout_average" | null;
  elevation_gain_m: number;
  average_power_w: number | null;
  average_speed_kmh: number | null;
  ground_contact_ms: number | null;
  stride_m: number | null;
  vertical_oscillation_cm: number | null;
};

export type ActivityRoutePoint = {
  latitude: number;
  longitude: number;
  distance_km?: number;
  elapsed_s?: number;
  altitude_m?: number;
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
      calories: number;
    };
    latest_run: {
      id: string;
      date: string;
      distance_km: number;
      pace: string;
      average_heartrate: number | null;
      calories: number | null;
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
    sleep: {
      latest: {
        date: string;
        hours: number;
        deep_minutes?: number;
        rem_minutes?: number;
        light_minutes?: number;
        awake_minutes?: number;
        efficiency?: number | null;
      } | null;
      days: { date: string; hours: number }[];
      goal: number;
    };
    steps: {
      latest: { date: string; count: number } | null;
      days: { date: string; count: number }[];
      goal: number;
    };
    active_energy: {
      latest: { date: string; kcal: number } | null;
      days: { date: string; kcal: number }[];
      goal: number;
    };
    total_calories?: {
      latest: { date: string; kcal: number } | null;
      days: { date: string; kcal: number }[];
    };
    daily_activity?: {
      latest: {
        date: string;
        active_minutes: number;
        zone_minutes: number;
        distance_km: number;
        sedentary_minutes: number;
      } | null;
      days: {
        date: string;
        active_minutes: number;
        zone_minutes: number;
        distance_km: number;
        sedentary_minutes: number;
      }[];
      active_minutes_goal: number;
      zone_minutes_goal: number;
    };
    exercises: {
      type: string;
      label: string;
      date: string;
      start_time: string;
      duration_minutes: number;
      calories: number | null;
      distance_km: number | null;
      average_heartrate: number | null;
      zone_minutes: number;
      source: "Fitbit";
    }[];
    recovery_history: {
      date: string;
      hrv?: number;
      resting_hr?: number;
    }[];
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

export type CalendarActualActivity = {
  type: string;
  label: string;
  source: "Apple Watch" | "Fitbit";
  duration_minutes: number | null;
  distance_km: number | null;
  calories: number | null;
  average_heartrate: number | null;
  zone_minutes: number | null;
};

export type CalendarDailyMetrics = {
  steps?: number;
  active_energy_kcal?: number;
  total_calories_kcal?: number;
  active_minutes?: number;
  zone_minutes?: number;
  distance_km?: number;
  sedentary_minutes?: number;
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
  completed: boolean;
  completion_source: "manual" | "apple_watch" | "fitbit" | null;
  completion_locked: boolean;
  actual_activities: CalendarActualActivity[];
  daily_metrics: CalendarDailyMetrics | null;
};

export type PlanCalendarDay = DailyAgendaItem & {
  is_today: boolean;
  is_past: boolean;
  is_current_week: boolean;
  completed: boolean;
};

export type PlanData = {
  fixed: boolean;
  policy: string;
  current_date: string;
  current_week_number: number | null;
  current_week_start: string;
  current_week_end: string;
  profile: Profile;
  weeks: TrainingWeek[];
  daily_agenda: DailyAgendaItem[];
  calendar: PlanCalendarDay[];
};

export type DashboardData = {
  demo_scenario: "recovered" | "sleep-debt" | "heavy-load" | "calibrating" | null;
  current_date: string;
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
  today_activity: {
    count: number;
    distance_km: number;
    moving_minutes: number;
    training_load: number;
    calories: number | null;
    average_heartrate: number | null;
  };
  daily_state: {
    calibration: {
      ready: boolean;
      nights: number;
      required: number;
    };
    morning_recovery: {
      score: number | null;
      label: string;
      summary: string;
      sleep_hours: number | null;
      factors: {
        key: "sleep" | "hrv" | "resting_hr";
        label: string;
        value: string;
        state: "low" | "neutral" | "good";
        detail: string;
      }[];
    };
    today_load: {
      level: "none" | "light" | "moderate" | "high";
      label: string;
      activities_count: number;
      duration_minutes: number;
      zone_minutes: number;
      calories: number;
      fitbit_exercises: DeviceInsights["fitbit"]["exercises"];
      apple_runs: number;
    };
    recommendation: {
      title: string;
      body: string;
      remaining: string;
    };
  };
  next_week: TrainingWeek | null;
  upcoming_weeks: TrainingWeek[];
  daily_agenda: DailyAgendaItem[];
};

export type CoachStatus = {
  configured: boolean;
  model: string;
  privacy: string;
};

export type CoachSummary = {
  profile: Profile;
  metrics: Pick<
    DashboardData["metrics"],
    "distance_current_week" | "average_weekly_28d" | "longest_42d"
  >;
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
