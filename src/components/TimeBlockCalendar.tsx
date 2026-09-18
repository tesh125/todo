"use client";

import { CalendarEvent, formatMinutes } from "@/lib/timeBlocks";

const DEFAULT_DAY_START = 7 * 60; // 7:00
const DEFAULT_DAY_END = 20 * 60; // 20:00
const PX_PER_MIN = 80 / 60;

function underlyingId(event: CalendarEvent): string | null {
  if (event.source === "ai" && event.id.startsWith("ai-")) return event.id.slice(3);
  if (event.source === "preference" && event.id.startsWith("pref-")) return event.id.slice(5);
  return null;
}

function SyncedBadge() {
  return (
    <span
      title="On your Google Calendar"
      className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: "var(--preference)" }}
    >
      <svg viewBox="0 0 12 12" className="h-2 w-2" fill="none">
        <path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function EventBlock({ event, dayStart, synced }: { event: CalendarEvent; dayStart: number; synced: boolean }) {
  const top = (event.start - dayStart) * PX_PER_MIN;
  const height = (event.end - event.start) * PX_PER_MIN;
  const isAi = event.source === "ai";
  const isPreference = event.source === "preference";
  const isBreak = event.source === "break";
  const showTime = height >= 34;

  return (
    <div
      className={`absolute left-16 right-2 overflow-hidden rounded-lg border px-2.5 py-1 text-[12.5px] leading-tight ${
        isAi
          ? "border-dashed border-accent bg-accent-soft text-accent"
          : isPreference
            ? "border-preference bg-preference-soft text-foreground"
            : isBreak
              ? "border-dashed border-muted bg-background text-muted"
              : "border-border bg-surface text-foreground shadow-sm"
      }`}
      style={{ top, height: Math.max(height, 17) }}
    >
      <div className="flex items-center gap-1.5">
        {isAi && (
          <span className="rounded-full bg-accent px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wide text-accent-foreground">
            AI
          </span>
        )}
        {isPreference && (
          <span
            className="rounded-full px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: "var(--preference)" }}
          >
            Fixed
          </span>
        )}
        {isBreak && (
          <span className="rounded-full bg-muted px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wide text-surface">
            Break
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
        {synced && <SyncedBadge />}
      </div>
      {showTime && (
        <span className="text-[11px] opacity-70">
          {formatMinutes(event.start)} – {formatMinutes(event.end)}
        </span>
      )}
    </div>
  );
}

export default function TimeBlockCalendar({
  events,
  syncedIds,
  googleConnected,
}: {
  events: CalendarEvent[];
  syncedIds: Set<string>;
  googleConnected: boolean;
}) {
  // The grid always covers at least 7am-8pm, but stretches to fit anything
  // scheduled earlier or later (e.g. a non-negotiable window reaching into
  // the evening) instead of letting it render outside the card.
  const earliestStart = events.reduce((min, e) => Math.min(min, e.start), DEFAULT_DAY_START);
  const latestEnd = events.reduce((max, e) => Math.max(max, e.end), DEFAULT_DAY_END);
  const dayStart = Math.floor(Math.min(earliestStart, DEFAULT_DAY_START) / 60) * 60;
  const dayEnd = Math.min(24 * 60, Math.ceil(Math.max(latestEnd, DEFAULT_DAY_END) / 60) * 60 + 60);

  const hours = [];
  for (let m = dayStart; m <= dayEnd; m += 60) hours.push(m);
  const totalHeight = (dayEnd - dayStart) * PX_PER_MIN;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      {googleConnected && (
        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted">
          <SyncedBadge />
          <span>means it&apos;s a real event on your Google Calendar</span>
        </div>
      )}
      <div className="relative" style={{ height: totalHeight }}>
        {hours.map((m) => (
          <div key={m} className="absolute left-0 right-0 flex items-start" style={{ top: (m - dayStart) * PX_PER_MIN }}>
            <span className="w-14 -translate-y-2 text-right text-[11px] text-muted pr-2">{formatMinutes(m)}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        ))}
        {events.map((event) => {
          const id = underlyingId(event);
          return <EventBlock key={event.id} event={event} dayStart={dayStart} synced={id !== null && syncedIds.has(id)} />;
        })}
      </div>
    </div>
  );
}
