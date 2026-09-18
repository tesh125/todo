"use client";

import { useState } from "react";
import { CalendarEvent } from "@/lib/timeBlocks";
import TimeBlockCalendar from "@/components/TimeBlockCalendar";

type DayView = { events: CalendarEvent[]; syncedIds: Set<string> };

export default function DayTabs({
  today,
  tomorrow,
  googleConnected,
}: {
  today: DayView;
  tomorrow: DayView;
  googleConnected: boolean;
}) {
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const active = day === "today" ? today : tomorrow;

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-border bg-surface p-1">
        {(["today", "tomorrow"] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDay(d)}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
              day === d ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      <TimeBlockCalendar events={active.events} syncedIds={active.syncedIds} googleConnected={googleConnected} />
    </div>
  );
}
