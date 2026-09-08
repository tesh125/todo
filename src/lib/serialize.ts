import type { Task } from "@prisma/client";
import { TaskDTO } from "@/lib/types";

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
