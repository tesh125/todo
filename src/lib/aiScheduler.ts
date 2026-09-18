import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { TaskDTO } from "@/lib/types";
import { estimateTaskDuration } from "@/lib/estimateDuration";
import {
  CalendarEvent,
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  formatMinutes,
  parseExplicitTime,
  suggestTimeBlocks,
} from "@/lib/timeBlocks";

export function isAISchedulingConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const ScheduledTaskSchema = z.object({
  taskId: z.string().describe("Must exactly match one of the given task ids — never invent one"),
  startMinute: z.number().int().min(0).max(1440).describe("Minutes since midnight"),
  endMinute: z.number().int().min(0).max(1440),
  reasoning: z.string().describe("One short sentence: why this duration and this placement"),
});

const ScheduledBreakSchema = z.object({
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  label: z.string().describe('Short label, e.g. "Walk break"'),
});

const ScheduleResponseSchema = z.object({
  tasks: z.array(ScheduledTaskSchema),
  breaks: z.array(ScheduledBreakSchema),
});

const SYSTEM_PROMPT = `You are a scheduling assistant for a personal daily planner. Given a list of open tasks and the events already on the calendar, place each task into a specific time slot for the day.

Rules:
1. Never overlap a busy block already on the calendar.
2. Estimate a realistic duration for each task from what it actually involves, not a flat default — a quick call/email/text is short (10-20 min), focused admin/editing work is short-medium (20-40 min), writing or creative work is medium (30-60 min), and deep, complex, or research-heavy work is long (60-120+ min).
3. Don't schedule more than about 2-3 hours of deep, cognitively demanding work back-to-back. Insert a short walk/break (10-20 min) between such stretches — as its own entry in "breaks", not as a task.
4. Stay within the given workday bounds, and don't place anything before "now" if a current time is given.
5. Weigh the user's stated preferences when ordering and placing tasks (e.g. "prefers deep work in the morning").
6. It's fine to leave some tasks unscheduled if the day is genuinely full — don't cram everything in.

Respond only via the schedule tool/schema. Every taskId you return must exactly match one of the ids given to you.`;

type SchedulingContext = {
  workStart: number;
  workEnd: number;
  nowMinutes?: number;
  freeformContext: string[];
};

async function callSchedulingModel(
  flexibleTasks: TaskDTO[],
  busy: CalendarEvent[],
  ctx: SchedulingContext
): Promise<z.infer<typeof ScheduleResponseSchema>> {
  const client = new Anthropic();

  const userContent = JSON.stringify({
    workdayStart: formatMinutes(ctx.workStart),
    workdayEnd: formatMinutes(ctx.workEnd),
    now: ctx.nowMinutes !== undefined ? formatMinutes(ctx.nowMinutes) : undefined,
    userPreferences: ctx.freeformContext,
    alreadyBusy: busy
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((e) => ({ title: e.title, start: formatMinutes(e.start), end: formatMinutes(e.end) })),
    tasksToSchedule: flexibleTasks.map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes ?? undefined,
    })),
  });

  const response = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(ScheduleResponseSchema) },
  });

  if (!response.parsed_output) throw new Error("AI scheduler returned no parseable output");
  return response.parsed_output;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Real "brain" behind the scheduler: sends today's (or tomorrow's) open
 * tasks, what's already busy, and the user's freeform preferences to Claude,
 * and asks it to reason about realistic durations, spacing, and breaks
 * instead of the flat keyword heuristic in suggestTimeBlocks(). Falls back
 * to that heuristic whenever there's no API key, nothing to schedule, or the
 * API call fails for any reason — this must never be the thing that breaks
 * the Time Blocks page. Every block the model returns is re-validated
 * against the busy list server-side before being trusted, so a
 * hallucinated or overlapping placement is dropped rather than double-booked.
 */
export async function suggestTimeBlocksWithAI(
  dayTasks: TaskDTO[],
  existingEvents: CalendarEvent[],
  options?: { workStart?: number; workEnd?: number; nowMinutes?: number; freeformContext?: string[] }
): Promise<CalendarEvent[]> {
  const workStart = options?.workStart ?? DEFAULT_WORK_START;
  const workEnd = options?.workEnd ?? DEFAULT_WORK_END;

  if (!isAISchedulingConfigured()) {
    return suggestTimeBlocks(dayTasks, existingEvents, options);
  }

  const pending = dayTasks.filter((t) => !t.completed);
  if (pending.length === 0) return [];

  const explicitBlocks: CalendarEvent[] = [];
  const flexibleTasks: TaskDTO[] = [];
  for (const task of pending) {
    const explicitStart = parseExplicitTime(task.title);
    if (explicitStart !== null) {
      const duration = task.estimatedMinutes ?? estimateTaskDuration(task.title);
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

  if (flexibleTasks.length === 0) return explicitBlocks;

  const busy = [...existingEvents, ...explicitBlocks];
  const flexibleById = new Map(flexibleTasks.map((t) => [t.id, t]));

  try {
    const result = await callSchedulingModel(flexibleTasks, busy, {
      workStart,
      workEnd,
      nowMinutes: options?.nowMinutes,
      freeformContext: options?.freeformContext ?? [],
    });

    const accepted: CalendarEvent[] = [];
    const taken = [...busy];
    const scheduledTaskIds = new Set<string>();

    // Accept in the order the model gave them, skipping anything that's
    // invalid, a duplicate, out of bounds, or overlaps something already
    // accepted (its own or the pre-existing busy list) — the model proposes,
    // this loop is what actually guarantees no double-booking.
    for (const t of result.tasks) {
      const task = flexibleById.get(t.taskId);
      if (!task || scheduledTaskIds.has(t.taskId)) continue;
      if (t.startMinute >= t.endMinute) continue;
      if (t.startMinute < workStart || t.endMinute > workEnd) continue;
      if (options?.nowMinutes !== undefined && t.startMinute < options.nowMinutes) continue;

      const candidate = { start: t.startMinute, end: t.endMinute };
      if (taken.some((b) => overlaps(b, candidate))) continue;

      const block: CalendarEvent = {
        id: `ai-${task.id}`,
        title: task.title,
        start: t.startMinute,
        end: t.endMinute,
        source: "ai",
      };
      accepted.push(block);
      taken.push(block);
      scheduledTaskIds.add(t.taskId);
    }

    for (const b of result.breaks) {
      if (b.startMinute >= b.endMinute) continue;
      if (b.startMinute < workStart || b.endMinute > workEnd) continue;

      const candidate = { start: b.startMinute, end: b.endMinute };
      if (taken.some((e) => overlaps(e, candidate))) continue;

      const block: CalendarEvent = {
        id: `break-${b.startMinute}`,
        title: b.label || "Break",
        start: b.startMinute,
        end: b.endMinute,
        source: "break",
      };
      accepted.push(block);
      taken.push(block);
    }

    return [...explicitBlocks, ...accepted];
  } catch (err) {
    console.error("AI scheduling failed, falling back to the heuristic scheduler:", err);
    return suggestTimeBlocks(dayTasks, existingEvents, options);
  }
}
