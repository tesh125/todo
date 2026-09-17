"use client";

import { useState } from "react";
import { SettingsDTO } from "@/lib/types";
import { minutesToTimeInputValue, timeInputValueToMinutes } from "@/lib/timeBlocks";

export default function WorkdayHours({ initialSettings }: { initialSettings: SettingsDTO }) {
  const [start, setStart] = useState(minutesToTimeInputValue(initialSettings.workStartMinute));
  const [end, setEnd] = useState(minutesToTimeInputValue(initialSettings.workEndMinute));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(nextStart: string, nextEnd: string) {
    const workStartMinute = timeInputValueToMinutes(nextStart);
    const workEndMinute = timeInputValueToMinutes(nextEnd);
    if (workStartMinute === null || workEndMinute === null || workEndMinute <= workStartMinute) return;

    setStatus("saving");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workStartMinute, workEndMinute }),
    });
    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-[13px] font-semibold">Workday hours</h2>
      <p className="mb-3 text-[12px] text-muted">The scheduler only places flexible tasks inside this window.</p>
      <div className="flex items-center gap-2 text-[13px]">
        <input
          type="time"
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            save(e.target.value, end);
          }}
          className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
        />
        <span className="text-muted">to</span>
        <input
          type="time"
          value={end}
          onChange={(e) => {
            setEnd(e.target.value);
            save(start, e.target.value);
          }}
          className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
        />
        {status === "saved" && <span className="text-[11px] text-muted">Saved</span>}
        {status === "error" && <span className="text-[11px] text-red-500">Couldn&apos;t save</span>}
      </div>
    </div>
  );
}
