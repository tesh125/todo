"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const CREATE_NEW = "__create_new__";

type Calendar = { id: string; name: string; primary: boolean };

export default function CalendarPicker({
  currentCalendarId,
  currentCalendarName,
}: {
  currentCalendarId: string | null;
  currentCalendarName: string | null;
}) {
  const router = useRouter();
  const [calendars, setCalendars] = useState<Calendar[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/google/calendars")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setCalendars(data.calendars))
      .catch(() => setFailed(true));
  }, []);

  async function handleChange(value: string) {
    setSaving(true);
    const body =
      value === CREATE_NEW
        ? { createNew: true }
        : { calendarId: value, calendarName: calendars?.find((c) => c.id === value)?.name ?? value };

    const res = await fetch("/api/google/calendars", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) router.refresh();
  }

  if (failed) return null;

  const knownCurrent = calendars?.some((c) => c.id === currentCalendarId) ?? false;

  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
      <span>Blocks go into</span>
      <select
        value={currentCalendarId ?? CREATE_NEW}
        disabled={!calendars || saving}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-md border border-border bg-surface px-1.5 py-1 text-[12.5px] text-foreground"
      >
        {!currentCalendarId && <option value={CREATE_NEW}>New &ldquo;Todo Blocker&rdquo; calendar</option>}
        {currentCalendarId && !knownCurrent && (
          <option value={currentCalendarId}>{currentCalendarName ?? currentCalendarId}</option>
        )}
        {calendars?.map((cal) => (
          <option key={cal.id} value={cal.id}>
            {cal.name}
            {cal.primary ? " (main)" : ""}
          </option>
        ))}
        {currentCalendarId && <option value={CREATE_NEW}>Create a new calendar instead</option>}
      </select>
    </div>
  );
}
