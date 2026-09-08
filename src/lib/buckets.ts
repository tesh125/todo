import { addDays, isBefore, isSameDay, startOfDay } from "date-fns";

export type Bucket = "today" | "tomorrow" | "later";

export function todayDate(): Date {
  return startOfDay(new Date());
}

export function tomorrowDate(): Date {
  return addDays(todayDate(), 1);
}

/**
 * Derives which bucket a task belongs in purely from its stored date,
 * compared against the current date. This is what makes "tomorrow" items
 * move to "today" automatically at midnight: nothing has to move, the
 * bucket is just recomputed live every time the page loads. Anything with
 * a past date also surfaces under "today" so nothing silently falls off.
 */
export function bucketForDate(date: Date | string | null): Bucket {
  if (!date) return "later";
  const d = startOfDay(new Date(date));
  const today = todayDate();
  const tomorrow = tomorrowDate();

  if (isSameDay(d, today) || isBefore(d, today)) return "today";
  if (isSameDay(d, tomorrow)) return "tomorrow";
  return "later";
}

/** Converts a bucket choice (from the UI) into the concrete date to store. */
export function dateForBucket(bucket: Bucket): Date | null {
  if (bucket === "today") return todayDate();
  if (bucket === "tomorrow") return tomorrowDate();
  return null;
}
