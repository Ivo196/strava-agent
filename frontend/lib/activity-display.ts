import type { Activity } from "@/lib/types";

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

function isGenericAppleRun(name: string) {
  return /^(carrera|running)(?:\s*[·-]\s*apple (?:health|watch))?$/i.test(name.trim());
}

export function activityDisplayName(activity: Pick<Activity, "name" | "date">) {
  if (isGenericAppleRun(activity.name)) {
    return `Carrera del ${shortDate.format(new Date(`${activity.date}T12:00:00`))}`;
  }
  return activity.name.replace(/Apple Health/gi, "Apple Watch");
}

export function activityDetailName(activity: Pick<Activity, "name">) {
  return isGenericAppleRun(activity.name)
    ? "Carrera con Apple Watch"
    : activity.name.replace(/Apple Health/gi, "Apple Watch");
}

export function activityDisplaySource(activity: Pick<Activity, "name">) {
  return /Apple (?:Health|Watch)/i.test(activity.name) ? "Apple Watch" : "Entrenamiento registrado";
}
