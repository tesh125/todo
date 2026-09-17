import { addDays } from "date-fns";
import { todayMidnightUTC } from "@/lib/timezone";

export type Bucket = "today" | "tomorrow" | "later";

export function todayDate(): Date {
  return todayMidnightUTC();
}

export function tomorrowDate(): Date {
  return addDays(todayDate(), 1);
}

/**
 * Derives which bucket a task belongs in purely from its stored date,
 * compared against the current date (in APP_TIMEZONE — see lib/timezone.ts).
 * This is what makes "tomorrow" items move to "today" automatically at
 * midnight: nothing has to move, the bucket is just recomputed live every
 * time the page loads. Anything with a past date also surfaces under
 * "today" so nothing silently falls off.
 *
 * todayDate()/tomorrowDate() always return the exact same UTC instant for a
 * given calendar day, so a direct timestamp comparison is enough here — no
 * need for date-fns' isSameDay, which would reinterpret the calendar day
 * using the server's own timezone instead of APP_TIMEZONE.
 */
export function bucketForDate(date: Date | string | null): Bucket {
  if (!date) return "later";
  const d = new Date(date).getTime();
  const today = todayDate().getTime();
  const tomorrow = tomorrowDate().getTime();

  if (d <= today) return "today";
  if (d === tomorrow) return "tomorrow";
  return "later";
}

/** Converts a bucket choice (from the UI) into the concrete date to store. */
export function dateForBucket(bucket: Bucket): Date | null {
  if (bucket === "today") return todayDate();
  if (bucket === "tomorrow") return tomorrowDate();
  return null;
}
