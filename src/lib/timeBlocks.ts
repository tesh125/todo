import { PreferenceDTO, TaskDTO } from "@/lib/types";

export type CalendarEvent = {
  id: string;
  title: string;
  /** Minutes since midnight. */
  start: number;
  end: number;
  source: "google" | "ai" | "preference";
};

/**
 * Locked preferences ("breakfast 7:00-7:30") become hard blocks on the
 * calendar, same as a real event — the scheduler treats them as busy time
 * and never places a task over them.
 */
export function lockedPreferenceEvents(preferences: PreferenceDTO[]): CalendarEvent[] {
  return preferences
    .filter((p): p is PreferenceDTO & { startMinute: number; endMinute: number } => p.locked && p.startMinute !== null && p.endMinute !== null)
    .map((p) => ({
      id: `pref-${p.id}`,
      title: p.text,
      start: p.startMinute,
      end: p.endMinute,
      source: "preference" as const,
    }));
}

/**
 * Places each "non-negotiable" windowed preference (e.g. 15 min reading
 * somewhere 9-11pm, or a 30 min walk somewhere noon-5pm) into the first open
 * slot inside its own window, working around whatever's already busy —
 * Google events and exact-time locked preferences. These get placed before
 * flexible tasks, so they're guaranteed a slot; tasks schedule around them,
 * not the other way around. A non-negotiable that genuinely can't fit its
 * window today (fully booked) is skipped rather than forced.
 */
export function placeWindowedPreferences(preferences: PreferenceDTO[], busyEvents: CalendarEvent[]): CalendarEvent[] {
  const windowed = preferences.filter(
    (p): p is PreferenceDTO & { durationMinutes: number; windowStartMinute: number; windowEndMinute: number } =>
      p.windowed && p.durationMinutes !== null && p.windowStartMinute !== null && p.windowEndMinute !== null
  );

  const busy = [...busyEvents].sort((a, b) => a.start - b.start);
  const placed: CalendarEvent[] = [];

  for (const pref of windowed) {
    let cursor = pref.windowStartMinute;

    for (const event of busy) {
      if (cursor < event.end && cursor + pref.durationMinutes > event.start) {
        cursor = event.end;
      }
    }

    if (cursor + pref.durationMinutes > pref.windowEndMinute) continue;

    const block: CalendarEvent = {
      id: `pref-${pref.id}`,
      title: pref.text,
      start: cursor,
      end: cursor + pref.durationMinutes,
      source: "preference",
    };
    placed.push(block);
    busy.push(block);
    busy.sort((a, b) => a.start - b.start);
  }

  return placed;
}

export const DEFAULT_WORK_START = 9 * 60; // 9:00
export const DEFAULT_WORK_END = 18 * 60; // 18:00
const DEFAULT_TASK_MINUTES = 30;

const TIME_IN_TITLE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;

/**
 * Pulls an explicit time out of a task title, e.g. "Interview 3pm" or
 * "3:30 PM call" -> 210 (minutes since midnight). Returns null if the title
 * doesn't mention a time. A task with an explicit time is treated as a
 * fixed appointment: the scheduler places it exactly there instead of
 * fitting it into the next open gap.
 */
export function parseExplicitTime(title: string): number | null {
  const match = TIME_IN_TITLE.exec(title);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const period = match[3].toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;

  if (hour === 12) hour = 0;
  if (period === "pm") hour += 12;

  return hour * 60 + minute;
}

/**
 * Placeholder for the real AI call: places any task with an explicit time
 * (parsed from its title) exactly there, then greedily drops the remaining
 * open tasks into the free gaps around existing events and those fixed
 * appointments. Replace the scheduling logic here with a Claude API call
 * once that's wired up — the shape (CalendarEvent[]) stays the same either
 * way.
 */
export function suggestTimeBlocks(
  todayTasks: TaskDTO[],
  existingEvents: CalendarEvent[],
  options?: { workStart?: number; workEnd?: number; nowMinutes?: number }
): CalendarEvent[] {
  const workStart = options?.workStart ?? DEFAULT_WORK_START;
  const workEnd = options?.workEnd ?? DEFAULT_WORK_END;
  const pending = todayTasks.filter((t) => !t.completed);

  const explicitBlocks: CalendarEvent[] = [];
  const flexibleTasks: TaskDTO[] = [];
  for (const task of pending) {
    const explicitStart = parseExplicitTime(task.title);
    if (explicitStart !== null) {
      const duration = task.estimatedMinutes ?? DEFAULT_TASK_MINUTES;
      explicitBlocks.push({
        id: `ai-${task.id}`,
        title: task.title,
        start: explicitStart,
        end: explicitStart + duration,
        source: "ai",
      });
    } else {
      flexibleTasks.push(task);
    }
  }

  const busy = [...existingEvents, ...explicitBlocks].sort((a, b) => a.start - b.start);
  const suggestions: CalendarEvent[] = [...explicitBlocks];

  // Never suggest a flexible task earlier than right now — only meaningful
  // for today, which is the only day this scheduler ever runs for.
  let cursor = Math.max(workStart, options?.nowMinutes ?? workStart);

  for (const task of flexibleTasks) {
    const duration = task.estimatedMinutes ?? DEFAULT_TASK_MINUTES;

    // Skip cursor past any event it currently overlaps.
    for (const event of busy) {
      if (cursor < event.end && cursor + duration > event.start) {
        cursor = event.end;
      }
    }

    if (cursor + duration > workEnd) break;

    const block: CalendarEvent = {
      id: `ai-${task.id}`,
      title: task.title,
      start: cursor,
      end: cursor + duration,
      source: "ai",
    };
    suggestions.push(block);
    busy.push(block);
    busy.sort((a, b) => a.start - b.start);
    cursor += duration;
  }

  return suggestions;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** For an <input type="time"> value, e.g. 450 -> "07:30". */
export function minutesToTimeInputValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Inverse of minutesToTimeInputValue, e.g. "07:30" -> 450. */
export function timeInputValueToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
