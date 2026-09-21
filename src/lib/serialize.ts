import type { Task, Preference } from "@prisma/client";
import { PreferenceDTO, TaskDTO } from "@/lib/types";
import { todayKeyInAppTZ } from "@/lib/timezone";

export function serializeTask(task: Task): TaskDTO {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    date: task.date ? task.date.toISOString() : null,
    completed: task.completed,
    order: task.order,
    estimatedMinutes: task.estimatedMinutes,
  };
}

export function serializePreference(pref: Preference): PreferenceDTO {
  return {
    id: pref.id,
    text: pref.text,
    locked: pref.locked,
    startMinute: pref.startMinute,
    endMinute: pref.endMinute,
    windowed: pref.windowed,
    durationMinutes: pref.durationMinutes,
    windowStartMinute: pref.windowStartMinute,
    windowEndMinute: pref.windowEndMinute,
    daysOfWeek: pref.daysOfWeek,
    completedToday: pref.completedDate === todayKeyInAppTZ(),
    order: pref.order,
  };
}
