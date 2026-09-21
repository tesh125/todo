"use client";

import { useState } from "react";
import { TaskDTO } from "@/lib/types";
import { adjacentBucket, Bucket } from "@/lib/buckets";

const BUCKET_LABEL: Record<Bucket, string> = { today: "Today", tomorrow: "Tomorrow", later: "Later" };

const ARROW_PATH: Record<"up" | "down" | "back" | "forward", string> = {
  up: "M4 10l4-4 4 4",
  down: "M4 6l4 4 4-4",
  back: "M10 4l-4 4 4 4",
  forward: "M6 4l4 4-4 4",
};

function ArrowButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "up" | "down" | "back" | "forward";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-md p-0.5 text-muted transition-colors hover:bg-accent-soft hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path d={ARROW_PATH[direction]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function TaskCard({
  task,
  bucket,
  onToggle,
  onDelete,
  onEstimateChange,
  onMoveBucket,
}: {
  task: TaskDTO;
  bucket: Bucket;
  onToggle: (task: TaskDTO) => void;
  onDelete: (task: TaskDTO) => void;
  onEstimateChange: (task: TaskDTO, minutes: number | null) => void;
  onMoveBucket: (task: TaskDTO, bucket: Bucket) => void;
}) {
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(String(task.estimatedMinutes ?? ""));

  function startEditing() {
    setDraftMinutes(String(task.estimatedMinutes ?? ""));
    setEditingEstimate(true);
  }

  function commitEstimate() {
    setEditingEstimate(false);
    const trimmed = draftMinutes.trim();
    if (trimmed === "") {
      if (task.estimatedMinutes !== null) onEstimateChange(task, null);
      return;
    }
    const minutes = Math.round(Number(trimmed));
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes === task.estimatedMinutes) return;
    onEstimateChange(task, minutes);
  }

  const backBucket = adjacentBucket(bucket, "back");
  const forwardBucket = adjacentBucket(bucket, "forward");

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
        {editingEstimate ? (
          <input
            autoFocus
            type="number"
            min={1}
            value={draftMinutes}
            onChange={(e) => setDraftMinutes(e.target.value)}
            onBlur={commitEstimate}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEstimate();
              }
              if (e.key === "Escape") {
                setDraftMinutes(String(task.estimatedMinutes ?? ""));
                setEditingEstimate(false);
              }
            }}
            aria-label="Estimated minutes"
            className="mt-1 w-14 rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              task.estimatedMinutes
                ? "bg-accent-soft text-accent hover:bg-accent/20"
                : "text-muted opacity-0 group-hover:opacity-100 hover:bg-accent-soft hover:text-accent"
            }`}
          >
            {task.estimatedMinutes ? `${task.estimatedMinutes}m` : "+ estimate"}
          </button>
        )}
      </div>

      {/* Right-side controls: push to an adjacent bucket, delete. Always
          visible (not hover-only like delete) since these are the
          touch/click alternative to drag-and-drop, which doesn't work well
          on mobile. Columns sit side by side on desktop (left/right reads
          naturally) but stack vertically on mobile, so below the sm
          breakpoint the same back/forward move renders as up/down instead —
          same action, oriented to match how the columns are actually laid
          out on screen. */}
      <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
        <div className="hidden items-center gap-0.5 sm:flex">
          <ArrowButton
            direction="back"
            label={backBucket ? `Move to ${BUCKET_LABEL[backBucket]}` : "Move to an earlier bucket"}
            disabled={!backBucket}
            onClick={() => backBucket && onMoveBucket(task, backBucket)}
          />
          <ArrowButton
            direction="forward"
            label={forwardBucket ? `Move to ${BUCKET_LABEL[forwardBucket]}` : "Move to a later bucket"}
            disabled={!forwardBucket}
            onClick={() => forwardBucket && onMoveBucket(task, forwardBucket)}
          />
        </div>
        <div className="flex items-center gap-0.5 sm:hidden">
          <ArrowButton
            direction="up"
            label={backBucket ? `Move to ${BUCKET_LABEL[backBucket]}` : "Move to an earlier bucket"}
            disabled={!backBucket}
            onClick={() => backBucket && onMoveBucket(task, backBucket)}
          />
          <ArrowButton
            direction="down"
            label={forwardBucket ? `Move to ${BUCKET_LABEL[forwardBucket]}` : "Move to a later bucket"}
            disabled={!forwardBucket}
            onClick={() => forwardBucket && onMoveBucket(task, forwardBucket)}
          />
        </div>
        <button
          onClick={() => onDelete(task)}
          aria-label="Delete task"
          className="shrink-0 rounded-md p-0.5 text-muted opacity-0 transition-opacity hover:bg-accent-soft hover:text-foreground group-hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
