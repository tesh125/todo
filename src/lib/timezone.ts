import { addDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

// Single-user personal app: the timezone is fixed here rather than detected
// per-request. Override with a TIMEZONE env var if this ever needs to change.
export const APP_TIMEZONE = process.env.TIMEZONE || "America/Toronto";

/** Today's date as "YYYY-MM-DD" in APP_TIMEZONE, independent of the server's own timezone. */
export function todayKeyInAppTZ(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Minutes since local midnight, right now, in APP_TIMEZONE. */
export function nowMinutesInAppTZ(): number {
  const zoned = toZonedTime(new Date(), APP_TIMEZONE);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/** The UTC instant corresponding to local midnight of "today" in APP_TIMEZONE. */
export function todayMidnightUTC(): Date {
  return fromZonedTime(`${todayKeyInAppTZ()} 00:00:00`, APP_TIMEZONE);
}

/** Converts "minutes since midnight, today, in APP_TIMEZONE" to a real UTC instant. */
export function minutesTodayToUTC(minutes: number): Date {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const wall = `${todayKeyInAppTZ()} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  return fromZonedTime(wall, APP_TIMEZONE);
}

/** Converts a UTC instant (e.g. from a Google Calendar event) to minutes since midnight in APP_TIMEZONE. */
export function minutesInAppTZFromISO(iso: string): number {
  const zoned = toZonedTime(new Date(iso), APP_TIMEZONE);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/** Same as todayKeyInAppTZ(), but for any day offset from today (0 = today, 1 = tomorrow, ...). */
export function dayKeyInAppTZ(offsetDays: number): string {
  if (offsetDays === 0) return todayKeyInAppTZ();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(addDays(new Date(), offsetDays));
}

/** Day of week (0 = Sunday ... 6 = Saturday) in APP_TIMEZONE, for any day offset from today. */
export function dayOfWeekInAppTZ(offsetDays: number): number {
  const date = offsetDays === 0 ? new Date() : addDays(new Date(), offsetDays);
  return toZonedTime(date, APP_TIMEZONE).getDay();
}

/** Same as todayMidnightUTC(), but for any day offset from today. */
export function dayMidnightUTC(offsetDays: number): Date {
  return fromZonedTime(`${dayKeyInAppTZ(offsetDays)} 00:00:00`, APP_TIMEZONE);
}

/** Same as minutesTodayToUTC(), but for any day offset from today. */
export function minutesOnDayToUTC(offsetDays: number, minutes: number): Date {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const wall = `${dayKeyInAppTZ(offsetDays)} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  return fromZonedTime(wall, APP_TIMEZONE);
}
