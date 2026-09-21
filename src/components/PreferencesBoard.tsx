"use client";

import { FormEvent, useState } from "react";
import { PreferenceDTO, SettingsDTO } from "@/lib/types";
import { formatMinutes, minutesToTimeInputValue, timeInputValueToMinutes } from "@/lib/timeBlocks";
import { detectRoutine } from "@/lib/routineDetection";

type Mode = "freeform" | "fixed" | "windowed";

const MODES: { value: Mode; label: string }[] = [
  { value: "freeform", label: "Just context" },
  { value: "fixed", label: "Exact time" },
  { value: "windowed", label: "Non-negotiable" },
];

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Delete preference"
      className="shrink-0 rounded-md p-0.5 text-muted opacity-0 transition-opacity hover:bg-accent-soft hover:text-foreground group-hover:opacity-100"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function daysSummary(days: number[]): string | null {
  if (days.length === 7) return null; // "every day" — no badge needed
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [...days].sort().map((d) => short[d]).join(", ");
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  function toggle(day: number) {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day];
    onChange(next);
  }

  return (
    <div className="flex items-center gap-1">
      {DAY_LABELS.map((label, day) => (
        <button
          key={day}
          type="button"
          onClick={() => toggle(day)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium transition-colors ${
            value.includes(day) ? "bg-accent text-accent-foreground" : "bg-accent-soft text-muted hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Edit preference"
      className="shrink-0 rounded-md p-0.5 text-muted opacity-0 transition-opacity hover:bg-accent-soft hover:text-foreground group-hover:opacity-100"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path
          d="M11 2l3 3-8 8-3.5 1 1-3.5 8-8z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export default function PreferencesBoard({
  initialPreferences,
  workStartMinute,
}: {
  initialPreferences: PreferenceDTO[];
  workStartMinute: SettingsDTO["workStartMinute"];
}) {
  const [preferences, setPreferences] = useState<PreferenceDTO[]>(initialPreferences);
  const [draftText, setDraftText] = useState("");
  const [draftMode, setDraftMode] = useState<Mode>("freeform");
  const [modeTouched, setModeTouched] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [draftStart, setDraftStart] = useState("07:00");
  const [draftEnd, setDraftEnd] = useState("08:00");
  const [draftDuration, setDraftDuration] = useState("30");
  const [draftWindowStart, setDraftWindowStart] = useState("12:00");
  const [draftWindowEnd, setDraftWindowEnd] = useState("17:00");
  const [draftDays, setDraftDays] = useState<number[]>(ALL_DAYS);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editWindowStart, setEditWindowStart] = useState("");
  const [editWindowEnd, setEditWindowEnd] = useState("");
  const [editDays, setEditDays] = useState<number[]>(ALL_DAYS);
  const [editError, setEditError] = useState<string | null>(null);

  function handleTextChange(value: string) {
    setDraftText(value);
    if (modeTouched) return; // user already picked a mode themselves — don't override it

    const suggestion = detectRoutine(value, workStartMinute);
    if (suggestion) {
      setDraftMode("windowed");
      setAutoDetected(true);
      setDraftDuration(String(suggestion.durationMinutes));
      setDraftWindowStart(minutesToTimeInputValue(suggestion.windowStartMinute));
      setDraftWindowEnd(minutesToTimeInputValue(suggestion.windowEndMinute));
    } else if (autoDetected) {
      // text no longer matches a routine keyword — fall back, still untouched
      setDraftMode("freeform");
      setAutoDetected(false);
    }
  }

  function handleModeClick(mode: Mode) {
    setModeTouched(true);
    setAutoDetected(false);
    setDraftMode(mode);
  }

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

    if ((locked || windowed) && draftDays.length === 0) {
      setError("Pick at least one day.");
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
        daysOfWeek: locked || windowed ? draftDays : ALL_DAYS,
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
    setModeTouched(false);
    setAutoDetected(false);
    setDraftDays(ALL_DAYS);
  }

  async function deletePreference(pref: PreferenceDTO) {
    setPreferences((p) => p.filter((x) => x.id !== pref.id));
    await fetch(`/api/preferences/${pref.id}`, { method: "DELETE" });
  }

  function startEdit(pref: PreferenceDTO) {
    setEditingId(pref.id);
    setEditError(null);
    setEditText(pref.text);
    setEditStart(pref.startMinute !== null ? minutesToTimeInputValue(pref.startMinute) : "07:00");
    setEditEnd(pref.endMinute !== null ? minutesToTimeInputValue(pref.endMinute) : "08:00");
    setEditDuration(pref.durationMinutes !== null ? String(pref.durationMinutes) : "30");
    setEditWindowStart(pref.windowStartMinute !== null ? minutesToTimeInputValue(pref.windowStartMinute) : "12:00");
    setEditWindowEnd(pref.windowEndMinute !== null ? minutesToTimeInputValue(pref.windowEndMinute) : "17:00");
    setEditDays(pref.daysOfWeek.length > 0 ? pref.daysOfWeek : ALL_DAYS);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(pref: PreferenceDTO) {
    const text = editText.trim();
    if (!text) {
      setEditError("Text can't be empty.");
      return;
    }

    const body: Record<string, unknown> = { text };

    if (pref.locked) {
      const startMinute = timeInputValueToMinutes(editStart);
      const endMinute = timeInputValueToMinutes(editEnd);
      if (startMinute === null || endMinute === null || endMinute <= startMinute) {
        setEditError("End time has to be after start time.");
        return;
      }
      if (editDays.length === 0) {
        setEditError("Pick at least one day.");
        return;
      }
      body.startMinute = startMinute;
      body.endMinute = endMinute;
      body.daysOfWeek = editDays;
    } else if (pref.windowed) {
      const durationMinutes = Number(editDuration);
      const windowStartMinute = timeInputValueToMinutes(editWindowStart);
      const windowEndMinute = timeInputValueToMinutes(editWindowEnd);
      if (
        !durationMinutes ||
        durationMinutes <= 0 ||
        windowStartMinute === null ||
        windowEndMinute === null ||
        windowEndMinute <= windowStartMinute ||
        durationMinutes > windowEndMinute - windowStartMinute
      ) {
        setEditError("Give it a duration that fits inside the window.");
        return;
      }
      if (editDays.length === 0) {
        setEditError("Pick at least one day.");
        return;
      }
      body.durationMinutes = durationMinutes;
      body.windowStartMinute = windowStartMinute;
      body.windowEndMinute = windowEndMinute;
      body.daysOfWeek = editDays;
    }

    const res = await fetch(`/api/preferences/${pref.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setEditError(resBody.error ?? "Couldn't save that change.");
      return;
    }
    const updated = (await res.json()) as PreferenceDTO;
    setPreferences((p) => p.map((x) => (x.id === pref.id ? updated : x)));
    setEditingId(null);
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
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="e.g. exercise, 15 min reading, afternoon walk…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-muted focus:border-accent"
          />

          <div className="flex items-center gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => handleModeClick(m.value)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  draftMode === m.value ? "bg-accent text-accent-foreground" : "bg-accent-soft text-muted hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
            {autoDetected && <span className="text-[11px] text-muted">detected as routine, edit below if needed</span>}
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

          {(draftMode === "fixed" || draftMode === "windowed") && (
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-[11px] text-muted">On</span>
              <DayPicker value={draftDays} onChange={setDraftDays} />
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
                Happens on the days picked above, somewhere in that window, fit around whatever else is on the
                calendar. Tasks schedule around it, not the other way around.
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
          {locked.map((pref) =>
            editingId === pref.id ? (
              <div key={pref.id} className="flex flex-col gap-2 rounded-xl border border-accent bg-surface px-3 py-2.5">
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-accent"
                />
                <div className="flex items-center gap-2 text-[13px]">
                  <input
                    type="time"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
                  />
                  <span className="text-muted">to</span>
                  <input
                    type="time"
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
                  />
                </div>
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="text-[11px] text-muted">On</span>
                  <DayPicker value={editDays} onChange={setEditDays} />
                </div>
                {editError && <p className="text-[12px] text-red-500">{editError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(pref)} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-foreground">
                    Save
                  </button>
                  <button onClick={cancelEdit} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted hover:text-foreground">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={pref.id}
                className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--preference)" }} />
                <p className="min-w-0 flex-1 truncate text-[13.5px]">{pref.text}</p>
                {daysSummary(pref.daysOfWeek) && (
                  <span className="shrink-0 text-[11px] text-muted">{daysSummary(pref.daysOfWeek)}</span>
                )}
                {pref.startMinute !== null && pref.endMinute !== null && (
                  <span className="shrink-0 rounded-full bg-preference-soft px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--preference)" }}>
                    {formatMinutes(pref.startMinute)} – {formatMinutes(pref.endMinute)}
                  </span>
                )}
                <EditButton onClick={() => startEdit(pref)} />
                <DeleteButton onClick={() => deletePreference(pref)} />
              </div>
            )
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-[13px] font-semibold text-muted">Non-negotiables</h2>
        <p className="mb-2 text-[12px] text-muted">
          Happen on their picked days (every day by default), somewhere in their window, no matter what.
        </p>
        <div className="flex flex-col gap-2">
          {windowed.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              Nothing here yet
            </p>
          )}
          {windowed.map((pref) =>
            editingId === pref.id ? (
              <div key={pref.id} className="flex flex-col gap-2 rounded-xl border border-accent bg-surface px-3 py-2.5">
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-accent"
                />
                <div className="flex items-center gap-2 text-[13px]">
                  <input
                    type="number"
                    min={1}
                    value={editDuration}
                    onChange={(e) => setEditDuration(e.target.value)}
                    className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
                  />
                  <span className="text-muted">min, sometime between</span>
                  <input
                    type="time"
                    value={editWindowStart}
                    onChange={(e) => setEditWindowStart(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
                  />
                  <span className="text-muted">and</span>
                  <input
                    type="time"
                    value={editWindowEnd}
                    onChange={(e) => setEditWindowEnd(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 outline-none focus:border-accent"
                  />
                </div>
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="text-[11px] text-muted">On</span>
                  <DayPicker value={editDays} onChange={setEditDays} />
                </div>
                {editError && <p className="text-[12px] text-red-500">{editError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(pref)} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-foreground">
                    Save
                  </button>
                  <button onClick={cancelEdit} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted hover:text-foreground">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={pref.id}
                className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--preference)" }} />
                <p className="min-w-0 flex-1 truncate text-[13.5px]">{pref.text}</p>
                {daysSummary(pref.daysOfWeek) && (
                  <span className="shrink-0 text-[11px] text-muted">{daysSummary(pref.daysOfWeek)}</span>
                )}
                {pref.durationMinutes !== null && pref.windowStartMinute !== null && pref.windowEndMinute !== null && (
                  <span className="shrink-0 rounded-full bg-preference-soft px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--preference)" }}>
                    {pref.durationMinutes}m, {formatMinutes(pref.windowStartMinute)} – {formatMinutes(pref.windowEndMinute)}
                  </span>
                )}
                <EditButton onClick={() => startEdit(pref)} />
                <DeleteButton onClick={() => deletePreference(pref)} />
              </div>
            )
          )}
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
          {freeform.map((pref) =>
            editingId === pref.id ? (
              <div key={pref.id} className="flex items-center gap-2 rounded-xl border border-accent bg-surface px-3 py-2.5">
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-accent"
                  autoFocus
                />
                <button onClick={() => saveEdit(pref)} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-foreground">
                  Save
                </button>
                <button onClick={cancelEdit} className="shrink-0 rounded-lg px-2 py-1.5 text-[12px] font-medium text-muted hover:text-foreground">
                  Cancel
                </button>
              </div>
            ) : (
              <div
                key={pref.id}
                className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                <p className="min-w-0 flex-1 truncate text-[13.5px]">{pref.text}</p>
                <EditButton onClick={() => startEdit(pref)} />
                <DeleteButton onClick={() => deletePreference(pref)} />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
