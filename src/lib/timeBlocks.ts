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

const WORK_START = 9 * 60; // 9:00
const WORK_END = 18 * 60; // 18:00
const DEFAULT_TASK_MINUTES = 30;

/**
 * Stand-in for a real Google Calendar fetch. Swap this out once OAuth is
 * wired up — everything downstream just consumes CalendarEvent[].
 */
export function getMockGoogleEvents(): CalendarEvent[] {
  return [
    { id: "gc-1", title: "Team standup", start: 9 * 60, end: 9 * 60 + 15, source: "google" },
    { id: "gc-2", title: "Lunch", start: 12 * 60, end: 13 * 60, source: "google" },
    { id: "gc-3", title: "1:1 with manager", start: 15 * 60, end: 15 * 60 + 30, source: "google" },
  ];
}

/**
 * Placeholder for the real AI call: greedily drops today's open tasks into
 * the free gaps around existing calendar events, in bucket order. Replace
 * the scheduling logic here with a Claude API call once that's wired up —
 * the shape (CalendarEvent[]) stays the same either way.
 */
export function suggestTimeBlocks(
  todayTasks: TaskDTO[],
  existingEvents: CalendarEvent[]
): CalendarEvent[] {
  const busy = [...existingEvents].sort((a, b) => a.start - b.start);
  const suggestions: CalendarEvent[] = [];

  let cursor = WORK_START;
  const pending = todayTasks.filter((t) => !t.completed);

  for (const task of pending) {
    const duration = task.estimatedMinutes ?? DEFAULT_TASK_MINUTES;

    // Skip cursor past any event it currently overlaps.
    for (const event of busy) {
      if (cursor < event.end && cursor + duration > event.start) {
        cursor = event.end;
      }
    }

    if (cursor + duration > WORK_END) break;

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

export { WORK_START, WORK_END };
