"use client";

import { TaskDTO } from "@/lib/types";
import { Bucket } from "@/lib/buckets";

export default function TaskCard({
  task,
  bucket,
  onToggle,
  onDelete,
}: {
  task: TaskDTO;
  bucket: Bucket;
  onToggle: (task: TaskDTO) => void;
  onDelete: (task: TaskDTO) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        onClick={() => onToggle(task)}
        aria-label="Toggle complete"
        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          task.completed ? "border-accent bg-accent" : "border-border"
        }`}
        style={{ width: 18, height: 18 }}
      >
        {task.completed && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
            <path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] leading-snug ${task.completed ? "text-muted line-through" : "text-foreground"}`}>
          {task.title}
        </p>
        {task.estimatedMinutes && bucket === "today" && (
          <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
            {task.estimatedMinutes}m
          </span>
        )}
      </div>

      <button
        onClick={() => onDelete(task)}
        aria-label="Delete task"
        className="mt-0.5 shrink-0 rounded-md p-0.5 text-muted opacity-0 transition-opacity hover:bg-accent-soft hover:text-foreground group-hover:opacity-100"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
