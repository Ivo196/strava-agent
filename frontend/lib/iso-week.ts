const monthShort = new Intl.DateTimeFormat("es-ES", { month: "short" });
const dayMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

export function parseLocalDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function startOfIsoWeek(value: string | Date) {
  const result = typeof value === "string" ? parseLocalDate(value) : new Date(value);
  const weekday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - weekday);
  result.setHours(12, 0, 0, 0);
  return result;
}

export function isoWeekDetails(value: string | Date) {
  const start = startOfIsoWeek(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const thursday = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  const weekday = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - weekday);
  const weekYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const weekNumber = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const rangeLabel = sameMonth
    ? `${start.getDate()}–${end.getDate()} ${monthShort.format(end)}`
    : `${dayMonth.format(start)}–${dayMonth.format(end)}`;

  return {
    end,
    key: `${weekYear}-W${String(weekNumber).padStart(2, "0")}`,
    rangeLabel,
    start,
    weekNumber,
    weekYear,
  };
}
