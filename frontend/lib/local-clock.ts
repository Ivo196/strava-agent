const configuredOffset = Number(process.env.NEXT_PUBLIC_DATE_OFFSET_DAYS ?? "0");
const dateOffsetDays = Number.isFinite(configuredOffset) ? configuredOffset : 0;

export function localNow(): Date {
  const now = new Date();
  now.setDate(now.getDate() + dateOffsetDays);
  return now;
}

export function localIsoDate(now = localNow()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
