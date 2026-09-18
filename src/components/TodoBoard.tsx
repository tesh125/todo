"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bucket, bucketForDate, dateForBucket } from "@/lib/buckets";
import { PreferenceDTO, TaskDTO } from "@/lib/types";
import TaskCard from "@/components/TaskCard";
import DailyItemCard from "@/components/DailyItemCard";
import Confetti from "@/components/Confetti";

const COLUMNS: { bucket: Bucket; title: string; hint: string; colorVar: string }[] = [
  { bucket: "today", title: "Today", hint: "What's on deck right now", colorVar: "var(--today)" },
  { bucket: "tomorrow", title: "Tomorrow", hint: "Rolls into Today at midnight", colorVar: "var(--tomorrow)" },
  { bucket: "later", title: "Later", hint: "Someday / backlog", colorVar: "var(--later)" },
];

export default function TodoBoard({
  initialTasks,
  initialDaily,
}: {
  initialTasks: TaskDTO[];
  initialDaily: PreferenceDTO[];
}) {
  const [tasks, setTasks] = useState<TaskDTO[]>(initialTasks);
  const [daily, setDaily] = useState<PreferenceDTO[]>(initialDaily);
  const [draftByBucket, setDraftByBucket] = useState<Record<Bucket, string>>({
    today: "",
    tomorrow: "",
    later: "",
  });
  const [dragOverBucket, setDragOverBucket] = useState<Bucket | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const grouped = useMemo(() => {
    const byBucket: Record<Bucket, TaskDTO[]> = { today: [], tomorrow: [], later: [] };
    for (const task of tasks) {
      byBucket[bucketForDate(task.date)].push(task);
    }
    return byBucket;
  }, [tasks]);

  // Celebrates finishing everything actually due today — Today's tasks plus
  // the Daily non-negotiables — not Tomorrow/Later, which aren't due yet.
  function celebrateIfAllDone(nextTasks: TaskDTO[], nextDaily: PreferenceDTO[]) {
    const todayItems = nextTasks.filter((t) => bucketForDate(t.date) === "today");
    const total = todayItems.length + nextDaily.length;
    if (total === 0) return;
    const allDone = todayItems.every((t) => t.completed) && nextDaily.every((p) => p.completedToday);
    if (!allDone) return;

    setConfettiKey((k) => k + 1);
    setShowConfetti(true);
    window.setTimeout(() => setShowConfetti(false), 2700);
  }

  async function addTask(bucket: Bucket, e: FormEvent) {
    e.preventDefault();
    const title = draftByBucket[bucket].trim();
    if (!title) return;
    setDraftByBucket((d) => ({ ...d, [bucket]: "" }));

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, bucket }),
    });
    const created = (await res.json()) as TaskDTO;
    setTasks((t) => [...t, created]);
  }

  async function toggleTask(task: TaskDTO) {
    const next = tasks.map((x) => (x.id === task.id ? { ...x, completed: !x.completed } : x));
    setTasks(next);
    celebrateIfAllDone(next, daily);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
  }

  async function toggleDaily(preference: PreferenceDTO) {
    const next = daily.map((p) => (p.id === preference.id ? { ...p, completedToday: !p.completedToday } : p));
    setDaily(next);
    celebrateIfAllDone(tasks, next);
    await fetch(`/api/preferences/${preference.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedToday: !preference.completedToday }),
    });
  }

  async function deleteTask(task: TaskDTO) {
    setTasks((t) => t.filter((x) => x.id !== task.id));
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
  }

  async function moveTask(taskId: string, bucket: Bucket) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || bucketForDate(task.date) === bucket) return;

    const optimisticDate = dateForBucket(bucket)?.toISOString() ?? null;
    setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, date: optimisticDate } : x)));

    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket }),
    });
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 p-4 sm:grid-cols-2 sm:p-8 xl:grid-cols-4">
      {showConfetti && <Confetti key={confettiKey} />}
      {COLUMNS.map((col) => {
        const items = grouped[col.bucket];
        const isDragOver = dragOverBucket === col.bucket;
        return (
          <div
            key={col.bucket}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverBucket(col.bucket);
            }}
            onDragLeave={() => setDragOverBucket((b) => (b === col.bucket ? null : b))}
            onDrop={(e) => {
              e.preventDefault();
              const taskId = e.dataTransfer.getData("text/task-id");
              setDragOverBucket(null);
              if (taskId) moveTask(taskId, col.bucket);
            }}
            className={`flex flex-col rounded-2xl border p-4 transition-colors ${
              isDragOver ? "border-accent bg-accent-soft" : "border-border bg-surface"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.colorVar }} />
              <h2 className="text-[15px] font-semibold">{col.title}</h2>
              <span className="ml-auto text-xs font-medium text-muted">{items.length}</span>
            </div>
            <p className="mb-4 text-xs text-muted">{col.hint}</p>

            <form onSubmit={(e) => addTask(col.bucket, e)} className="mb-3">
              <input
                value={draftByBucket[col.bucket]}
                onChange={(e) => setDraftByBucket((d) => ({ ...d, [col.bucket]: e.target.value }))}
                placeholder="Add a task…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-muted focus:border-accent"
              />
            </form>

            <div className="flex flex-1 flex-col gap-2">
              {items.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                  Nothing here
                </p>
              )}
              {items.map((task) => (
                <TaskCard key={task.id} task={task} bucket={col.bucket} onToggle={toggleTask} onDelete={deleteTask} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex flex-col rounded-2xl border border-border bg-surface p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--preference)" }} />
          <h2 className="text-[15px] font-semibold">Daily</h2>
          <span className="ml-auto text-xs font-medium text-muted">{daily.length}</span>
        </div>
        <p className="mb-4 text-xs text-muted">Non-negotiables, every day</p>

        <div className="flex flex-1 flex-col gap-2">
          {daily.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              No non-negotiables yet. Add some on the{" "}
              <a href="/preferences" className="text-accent underline">
                Preferences
              </a>{" "}
              page.
            </p>
          )}
          {daily.map((preference) => (
            <DailyItemCard key={preference.id} preference={preference} onToggle={toggleDaily} />
          ))}
        </div>
      </div>
    </div>
  );
}
