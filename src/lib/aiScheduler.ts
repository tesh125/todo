import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
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

const DurationEstimateSchema = z.object({
  taskId: z.string().describe("Must exactly match one of the given task ids — never invent one"),
  minutes: z.number().int().min(5).max(240).describe("Estimated realistic duration in minutes"),
});

const DurationEstimateResponseSchema = z.object({
  estimates: z.array(DurationEstimateSchema),
});

const DURATION_SYSTEM_PROMPT = `Estimate a realistic duration in minutes for each task below, based on what it actually involves — a quick call/email/text is short (10-20 min), focused admin/editing work is short-medium (20-40 min), writing or creative work is medium (30-60 min), and deep, complex, or research-heavy work is long (60-120+ min).

Respond only via the schedule tool/schema. Every taskId you return must exactly match one of the ids given to you.`;

const SYSTEM_PROMPT = `You are a scheduling assistant for a personal daily planner. Given a list of open tasks and the events already on the calendar, place each task into a specific time slot for the day.

Rules:
1. Never overlap a busy block already on the calendar.
2. If a task already carries an estimatedMinutes, use that exact duration — it's either the user's own adjustment or an earlier real estimate, so don't second-guess it. Otherwise estimate a realistic duration from what the task actually involves, not a flat default — a quick call/email/text is short (10-20 min), focused admin/editing work is short-medium (20-40 min), writing or creative work is medium (30-60 min), and deep, complex, or research-heavy work is long (60-120+ min).
3. Never schedule more than 3 hours of deep, cognitively demanding work back-to-back. Insert a 30 minute walk/break right after any such stretch reaches 3 hours — as its own entry in "breaks", not as a task.
4. Stay within the given workday bounds, and don't place anything before "now" if a current time is given.
5. Weigh the user's stated preferences when ordering and placing tasks (e.g. "prefers deep work in the morning").
6. It's fine to leave some tasks unscheduled if the day is genuinely full — don't cram everything in.
7. When several tasks are similar in kind (e.g. a handful of quick emails/calls, or a few small edits), group them back-to-back with no gap between them rather than scattering them through the day — it cuts down on context-switching. Only group tasks that are genuinely alike; don't force unrelated tasks together just to close a gap.

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
      estimatedMinutes: t.estimatedMinutes ?? undefined,
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

/**
 * Duration-only counterpart to callSchedulingModel(), for tasks whose
 * placement is already fixed (an explicit time parsed from the title) and
 * just need a realistic length — asking the full scheduling model to also
 * place these would be redundant since they don't move. Also reused by
 * estimateDurationForTask() below for a single brand-new task.
 */
async function callDurationEstimateModel(
  tasks: Pick<TaskDTO, "id" | "title" | "notes">[]
): Promise<Map<string, number>> {
  const client = new Anthropic();

  const userContent = JSON.stringify({
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, notes: t.notes ?? undefined })),
  });

  const response = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system: DURATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(DurationEstimateResponseSchema) },
  });

  if (!response.parsed_output) throw new Error("AI duration estimate returned no parseable output");
  return new Map(response.parsed_output.estimates.map((e) => [e.taskId, e.minutes]));
}

/**
 * Guesses a duration for a brand-new task the moment it's created (see
 * POST /api/tasks), so there's something to show — and adjust — right away
 * instead of waiting for the task to reach today's calendar. Same
 * Sonnet-or-heuristic fallback shape as the rest of this file.
 */
export async function estimateDurationForTask(title: string, notes?: string | null): Promise<number> {
  if (!isAISchedulingConfigured()) return estimateTaskDuration(title);

  try {
    const estimates = await callDurationEstimateModel([{ id: "new-task", title, notes: notes ?? null }]);
    return estimates.get("new-task") ?? estimateTaskDuration(title);
  } catch (err) {
    console.error("AI duration estimate failed for a new task, falling back to the keyword heuristic:", err);
    return estimateTaskDuration(title);
  }
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && a.end > b.start;
}

// Saves a Sonnet-derived duration back onto the task itself (only ever
// called for a task that didn't already have one) so it shows up as the
// task's real estimate everywhere — the todo board included — not just for
// today's calendar render. Best-effort: a failed write shouldn't break the
// Time Blocks page, since the estimate still gets used for this render
// either way.
async function persistEstimatedMinutes(taskId: string, minutes: number): Promise<void> {
  try {
    await prisma.task.update({ where: { id: taskId }, data: { estimatedMinutes: minutes } });
  } catch (err) {
    console.error("Failed to save AI duration estimate onto the task:", err);
  }
}

/**
 * Real "brain" behind the scheduler: sends a day's open tasks, what's
 * already busy, and the user's freeform preferences to Claude, and asks it
 * to reason about realistic durations, spacing/grouping, and breaks instead
 * of the flat keyword heuristic in suggestTimeBlocks(). Only called for
 * *today* — the caller (calendar/page.tsx) shows tomorrow via the plain
 * heuristic instead, so a page load never burns more than one day's worth of
 * model calls. Tasks with an explicit time in their title skip placement
 * (they're already fixed) but still get a Sonnet duration estimate via
 * callDurationEstimateModel(). Falls back to the keyword heuristic whenever
 * there's no API key, nothing to schedule, or an API call fails for any
 * reason — this must never be the thing that breaks the Time Blocks page.
 * Every block the scheduling model returns is re-validated against the busy
 * list server-side before being trusted, so a hallucinated or overlapping
 * placement is dropped rather than double-booked. Any task that didn't
 * already have an estimatedMinutes gets Sonnet's estimate saved back onto
 * it, so it shows up as the task's real estimate on the todo board too.
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

  const explicitTasks: { task: TaskDTO; start: number }[] = [];
  const flexibleTasks: TaskDTO[] = [];
  for (const task of pending) {
    const explicitStart = parseExplicitTime(task.title);
    if (explicitStart !== null) {
      explicitTasks.push({ task, start: explicitStart });
    } else {
      flexibleTasks.push(task);
    }
  }

  // Explicit-time tasks don't need the model to place them, just to size
  // them — so give Sonnet a shot at a real duration estimate here too,
  // instead of always falling back to the keyword heuristic the way the
  // non-AI scheduler does.
  const needsDuration = explicitTasks.filter(({ task }) => task.estimatedMinutes == null);
  let aiDurations = new Map<string, number>();
  if (needsDuration.length > 0) {
    try {
      aiDurations = await callDurationEstimateModel(needsDuration.map(({ task }) => task));
    } catch (err) {
      console.error("AI duration estimate failed, falling back to the keyword heuristic:", err);
    }
  }

  const explicitBlocks: CalendarEvent[] = explicitTasks.map(({ task, start }) => {
    const duration = task.estimatedMinutes ?? aiDurations.get(task.id) ?? estimateTaskDuration(task.title);
    return {
      id: `ai-${task.id}`,
      title: task.title,
      start,
      end: start + duration,
      source: "ai",
    };
  });

  await Promise.all(
    explicitTasks
      .filter(({ task }) => task.estimatedMinutes == null && aiDurations.has(task.id))
      .map(({ task }) => persistEstimatedMinutes(task.id, aiDurations.get(task.id)!))
  );

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
      if (task.estimatedMinutes == null) {
        await persistEstimatedMinutes(task.id, t.endMinute - t.startMinute);
      }
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
