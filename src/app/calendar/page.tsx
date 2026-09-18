import type { GoogleAccount, Task } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializePreference, serializeTask } from "@/lib/serialize";
import { Bucket, bucketForDate } from "@/lib/buckets";
import { CalendarEvent, lockedPreferenceEvents, placeWindowedPreferences } from "@/lib/timeBlocks";
import { suggestTimeBlocksWithAI } from "@/lib/aiScheduler";
import {
  getGoogleConnection,
  getGoogleEventsForDay,
  syncPreferenceBlocksToGoogle,
  syncTaskBlocksToGoogle,
} from "@/lib/googleCalendar";
import { getSettings } from "@/lib/settings";
import { dayKeyInAppTZ, nowMinutesInAppTZ } from "@/lib/timezone";
import { PreferenceDTO, SettingsDTO, TaskDTO } from "@/lib/types";
import DayTabs from "@/components/DayTabs";
import GoogleConnect from "@/components/GoogleConnect";
import CalendarPicker from "@/components/CalendarPicker";
import RefreshButton from "@/components/RefreshButton";

export const dynamic = "force-dynamic";

/**
 * Builds one day's worth of the Time Blocks view — real Google events for
 * that day (minus anything the app already synced there itself), locked +
 * windowed non-negotiables, and AI-suggested task blocks — then, if
 * connected, writes any newly-placed task block to Google. A task only ever
 * gets synced once regardless of which day it was scheduled under, so
 * syncing both today's and tomorrow's task blocks is safe. Preferences only
 * ever get synced to Google for *today* specifically (that's the dedup key
 * syncPreferenceBlocksToGoogle uses), so a tomorrow non-negotiable shown
 * here is a preview of where it'll land, not yet a real event — it becomes
 * one automatically once that day arrives and the page is next loaded.
 */
async function buildDayView({
  offsetDays,
  bucket,
  taskDTOs,
  rawTasks,
  preferenceDTOs,
  rawPreferences,
  freeformContext,
  settings,
  googleAccount,
  nowMinutes,
}: {
  offsetDays: number;
  bucket: Bucket;
  taskDTOs: TaskDTO[];
  rawTasks: Pick<Task, "id" | "googleEventId">[];
  preferenceDTOs: PreferenceDTO[];
  rawPreferences: { id: string; googleEventId: string | null; googleEventDate: string | null }[];
  freeformContext: string[];
  settings: SettingsDTO;
  googleAccount: GoogleAccount | null;
  nowMinutes?: number;
}): Promise<{ events: CalendarEvent[]; syncedIds: Set<string> }> {
  const googleEvents = await getGoogleEventsForDay(offsetDays);
  const dayKey = dayKeyInAppTZ(offsetDays);

  // Exclude events the app itself already created for this day — otherwise a
  // synced task/preference would render twice: once as its real "AI"/"Fixed"
  // block, once again as a plain event read straight off the calendar.
  const knownEventIds = new Set(
    [
      ...rawTasks.map((t) => t.googleEventId),
      ...rawPreferences.filter((p) => p.googleEventDate === dayKey).map((p) => p.googleEventId),
    ].filter((id): id is string => Boolean(id))
  );
  const realGoogleEvents = (googleEvents ?? []).filter((e) => !knownEventIds.has(e.id));

  const dayTasks = taskDTOs.filter((t) => bucketForDate(t.date) === bucket);
  const preferenceBlocks = lockedPreferenceEvents(preferenceDTOs);
  const windowedBlocks = placeWindowedPreferences(preferenceDTOs, [...realGoogleEvents, ...preferenceBlocks]);
  const fixedEvents = [...realGoogleEvents, ...preferenceBlocks, ...windowedBlocks];
  const aiEvents = await suggestTimeBlocksWithAI(dayTasks, fixedEvents, {
    workStart: settings.workStartMinute,
    workEnd: settings.workEndMinute,
    nowMinutes,
    freeformContext,
  });

  let syncedIds = new Set<string>();
  if (googleAccount) {
    const taskSync = await syncTaskBlocksToGoogle(aiEvents, rawTasks, offsetDays);
    syncedIds = taskSync;
    if (offsetDays === 0) {
      const prefSync = await syncPreferenceBlocksToGoogle([...preferenceBlocks, ...windowedBlocks], rawPreferences);
      syncedIds = new Set([...syncedIds, ...prefSync]);
    }
  }

  return { events: [...fixedEvents, ...aiEvents], syncedIds };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ google_error?: string }>;
}) {
  const { google_error } = await searchParams;

  const [tasks, preferences, googleAccount, settings] = await Promise.all([
    prisma.task.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.preference.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    getGoogleConnection(),
    getSettings(),
  ]);

  const taskDTOs = tasks.map(serializeTask);
  const preferenceDTOs = preferences.map(serializePreference);
  const freeformPreferences = preferenceDTOs.filter((p) => !p.locked && !p.windowed);

  // Sequential, not Promise.all: if the dedicated calendar doesn't exist yet,
  // both days' syncs would otherwise race to create it concurrently and
  // could end up creating two.
  const freeformContext = freeformPreferences.map((p) => p.text);

  const today = await buildDayView({
    offsetDays: 0,
    bucket: "today",
    taskDTOs,
    rawTasks: tasks,
    preferenceDTOs,
    rawPreferences: preferences,
    freeformContext,
    settings,
    googleAccount,
    nowMinutes: nowMinutesInAppTZ(),
  });
  const tomorrow = await buildDayView({
    offsetDays: 1,
    bucket: "tomorrow",
    taskDTOs,
    rawTasks: tasks,
    preferenceDTOs,
    rawPreferences: preferences,
    freeformContext,
    settings,
    googleAccount,
    // No nowMinutes: tomorrow's flexible tasks can start anywhere from the
    // workday's start, since the whole day is still open.
  });

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-surface px-8 py-6">
        <h1 className="text-xl font-semibold tracking-tight">Time Blocks</h1>
        <div className="flex flex-wrap items-center gap-4">
          {googleAccount && (
            <CalendarPicker
              currentCalendarId={googleAccount.calendarId}
              currentCalendarName={googleAccount.calendarName}
            />
          )}
          <GoogleConnect connected={Boolean(googleAccount)} email={googleAccount?.email ?? null} error={google_error ?? null} />
          <RefreshButton />
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-6 p-8 md:grid-cols-[1fr_260px]">
        <DayTabs today={today} tomorrow={tomorrow} googleConnected={Boolean(googleAccount)} />

        <aside className="flex flex-col gap-3">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-[13px] font-semibold">AI context</h2>
            {freeformPreferences.length === 0 ? (
              <p className="text-[12px] text-muted">
                No preferences yet. Add some on the{" "}
                <a href="/preferences" className="text-accent underline">
                  Preferences
                </a>{" "}
                page.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {freeformPreferences.map((p) => (
                  <li key={p.id} className="flex gap-1.5 text-[12.5px]">
                    <span className="text-muted">•</span>
                    <span>{p.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
