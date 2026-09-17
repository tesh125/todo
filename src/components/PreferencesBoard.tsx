"use client";

import { FormEvent, useState } from "react";
import { PreferenceDTO } from "@/lib/types";
import { formatMinutes, timeInputValueToMinutes } from "@/lib/timeBlocks";

export default function PreferencesBoard({ initialPreferences }: { initialPreferences: PreferenceDTO[] }) {
  const [preferences, setPreferences] = useState<PreferenceDTO[]>(initialPreferences);
  const [draftText, setDraftText] = useState("");
  const [draftLocked, setDraftLocked] = useState(false);
  const [draftStart, setDraftStart] = useState("07:00");
  const [draftEnd, setDraftEnd] = useState("08:00");
  const [error, setError] = useState<string | null>(null);

  async function addPreference(e: FormEvent) {
    e.preventDefault();
    const text = draftText.trim();
    if (!text) return;
    setError(null);

    const startMinute = draftLocked ? timeInputValueToMinutes(draftStart) : null;
    const endMinute = draftLocked ? timeInputValueToMinutes(draftEnd) : null;
    if (draftLocked && (startMinute === null || endMinute === null || endMinute <= startMinute)) {
      setError("End time has to be after start time.");
      return;
    }

    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, locked: draftLocked, startMinute, endMinute }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save that preference.");
      return;
    }
    const created = (await res.json()) as PreferenceDTO;
    setPreferences((p) => [...p, created]);
    setDraftText("");
    setDraftLocked(false);
  }

  async function deletePreference(pref: PreferenceDTO) {
    setPreferences((p) => p.filter((x) => x.id !== pref.id));
    await fetch(`/api/preferences/${pref.id}`, { method: "DELETE" });
  }

  const locked = preferences.filter((p) => p.locked);
  const freeform = preferences.filter((p) => !p.locked);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <form onSubmit={addPreference} className="flex flex-col gap-3">
          <input
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="e.g. exercise, or prefer deep work in the morning…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-muted focus:border-accent"
          />

          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={draftLocked}
              onChange={(e) => setDraftLocked(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Lock this to a specific time (blocks the calendar so nothing else can be scheduled over it)
          </label>

          {draftLocked && (
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
