"use client";

import { FormEvent, useState } from "react";
import { PreferenceDTO } from "@/lib/types";
import { formatMinutes, timeInputValueToMinutes } from "@/lib/timeBlocks";

type Mode = "freeform" | "fixed" | "windowed";

const MODES: { value: Mode; label: string }[] = [
  { value: "freeform", label: "Just context" },
  { value: "fixed", label: "Exact time" },
  { value: "windowed", label: "Non-negotiable" },
];

export default function PreferencesBoard({ initialPreferences }: { initialPreferences: PreferenceDTO[] }) {
  const [preferences, setPreferences] = useState<PreferenceDTO[]>(initialPreferences);
  const [draftText, setDraftText] = useState("");
  const [draftMode, setDraftMode] = useState<Mode>("freeform");
  const [draftStart, setDraftStart] = useState("07:00");
  const [draftEnd, setDraftEnd] = useState("08:00");
  const [draftDuration, setDraftDuration] = useState("30");
  const [draftWindowStart, setDraftWindowStart] = useState("12:00");
  const [draftWindowEnd, setDraftWindowEnd] = useState("17:00");
  const [error, setError] = useState<string | null>(null);

  async function addPreference(e: FormEvent) {
    e.preventDefault();
    const text = draftText.trim();
    if (!text) return;
    setError(null);

    const locked = draftMode === "fixed";
    const windowed = draftMode === "windowed";

    const startMinute = locked ? timeInputValueToMinutes(draftStart) : null;
    const endMinute = locked ? timeInputValueToMinutes(draftEnd) : null;
    if (locked && (startMinute === null || endMinute === null || endMinute <= startMinute)) {
      setError("End time has to be after start time.");
      return;
    }

    const durationMinutes = windowed ? Number(draftDuration) : null;
    const windowStartMinute = windowed ? timeInputValueToMinutes(draftWindowStart) : null;
    const windowEndMinute = windowed ? timeInputValueToMinutes(draftWindowEnd) : null;
    if (
      windowed &&
      (!durationMinutes ||
        durationMinutes <= 0 ||
        windowStartMinute === null ||
        windowEndMinute === null ||
        windowEndMinute <= windowStartMinute ||
        durationMinutes > windowEndMinute - windowStartMinute)
    ) {
      setError("Give it a duration that fits inside the window.");
      return;
    }

    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        locked,
        startMinute,
        endMinute,
        windowed,
        durationMinutes,
        windowStartMinute,
        windowEndMinute,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save that preference.");
      return;
    }
    const created = (await res.json()) as PreferenceDTO;
    setPreferences((p) => [...p, created]);
    setDraftText("");
    setDraftMode("freeform");
  }

  async function deletePreference(pref: PreferenceDTO) {
    setPreferences((p) => p.filter((x) => x.id !== pref.id));
    await fetch(`/api/preferences/${pref.id}`, { method: "DELETE" });
  }

  const locked = preferences.filter((p) => p.locked);
  const windowed = preferences.filter((p) => p.windowed);
  const freeform = preferences.filter((p) => !p.locked && !p.windowed);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <form onSubmit={addPreference} className="flex flex-col gap-3">
          <input
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="e.g. exercise, 15 min reading, afternoon walk…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-muted focus:border-accent"
          />

          <div className="flex gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setDraftMode(m.value)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  draftMode === m.value ? "bg-accent text-accent-foreground" : "bg-accent-soft text-muted hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {draftMode === "fixed" && (
            <div className="flex items-center gap-2 text-[13px]">
              <input
                type="time"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
              />
              <span className="text-muted">to</span>
              <input
                type="time"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
              />
              <span className="text-[11px] text-muted">Blocks the calendar, nothing can overlap it</span>
            </div>
          )}

          {draftMode === "windowed" && (
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={draftDuration}
                  onChange={(e) => setDraftDuration(e.target.value)}
                  className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
                />
                <span className="text-muted">min, sometime between</span>
                <input
                  type="time"
                  value={draftWindowStart}
                  onChange={(e) => setDraftWindowStart(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
                />
                <span className="text-muted">and</span>
                <input
                  type="time"
                  value={draftWindowEnd}
                  onChange={(e) => setDraftWindowEnd(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
                />
              </div>
              <span className="text-[11px] text-muted">
                Happens every day somewhere in that window, fit around whatever else is on the calendar. Tasks schedule
                around it, not the other way around.
              </span>
            </div>
          )}

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          <button
            type="submit"
            className="self-start rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground"
          >
            Add preference
          </button>
        </form>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-[13px] font-semibold text-muted">Locked times</h2>
        <div className="flex flex-col gap-2">
          {locked.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              Nothing locked yet
            </p>
          )}
          {locked.map((pref) => (
            <div
              key={pref.id}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--preference)" }} />
              <p className="min-w-0 flex-1 truncate text-[13.5px]">{pref.text}</p>
              {pref.startMinute !== null && pref.endMinute !== null && (
                <span className="shrink-0 rounded-full bg-preference-soft px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--preference)" }}>
                  {formatMinutes(pref.startMinute)} – {formatMinutes(pref.endMinute)}
                </span>
              )}
              <button
                onClick={() => deletePreference(pref)}
                aria-label="Delete preference"
                className="shrink-0 rounded-md p-0.5 text-muted opacity-0 transition-opacity hover:bg-accent-soft hover:text-foreground group-hover:opacity-100"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-[13px] font-semibold text-muted">Non-negotiables</h2>
        <p className="mb-2 text-[12px] text-muted">Happen every day, somewhere in their window, no matter what.</p>
        <div className="flex flex-col gap-2">
          {windowed.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              Nothing here yet
            </p>
          )}
          {windowed.map((pref) => (
            <div
              key={pref.id}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--preference)" }} />
              <p className="min-w-0 flex-1 truncate text-[13.5px]">{pref.text}</p>
              {pref.durationMinutes !== null && pref.windowStartMinute !== null && pref.windowEndMinute !== null && (
                <span className="shrink-0 rounded-full bg-preference-soft px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--preference)" }}>
                  {pref.durationMinutes}m, {formatMinutes(pref.windowStartMinute)} – {formatMinutes(pref.windowEndMinute)}
                </span>
              )}
              <button
                onClick={() => deletePreference(pref)}
                aria-label="Delete preference"
                className="shrink-0 rounded-md p-0.5 text-muted opacity-0 transition-opacity hover:bg-accent-soft hover:text-foreground group-hover:opacity-100"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-[13px] font-semibold text-muted">General preferences</h2>
        <p className="mb-2 text-[12px] text-muted">
          Free text the AI reads as context every time it blocks your day, with no fixed time attached.
        </p>
        <div className="flex flex-col gap-2">
          {freeform.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              Nothing here yet
            </p>
          )}
          {freeform.map((pref) => (
            <div
              key={pref.id}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
              <p className="min-w-0 flex-1 truncate text-[13.5px]">{pref.text}</p>
              <button
                onClick={() => deletePreference(pref)}
                aria-label="Delete preference"
                className="shrink-0 rounded-md p-0.5 text-muted opacity-0 transition-opacity hover:bg-accent-soft hover:text-foreground group-hover:opacity-100"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
