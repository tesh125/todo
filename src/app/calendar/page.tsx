import { prisma } from "@/lib/prisma";
import { serializePreference, serializeTask } from "@/lib/serialize";
import { bucketForDate } from "@/lib/buckets";
import { lockedPreferenceEvents, placeWindowedPreferences, suggestTimeBlocks } from "@/lib/timeBlocks";
import {
  getGoogleConnection,
  getTodaysGoogleEvents,
  syncPreferenceBlocksToGoogle,
  syncTaskBlocksToGoogle,
} from "@/lib/googleCalendar";
import { getSettings } from "@/lib/settings";
import { nowMinutesInAppTZ } from "@/lib/timezone";
import TimeBlockCalendar from "@/components/TimeBlockCalendar";
import GoogleConnect from "@/components/GoogleConnect";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ google_error?: string }>;
}) {
  const { google_error } = await searchParams;

  const [tasks, preferences, googleAccount, googleEvents, settings] = await Promise.all([
    prisma.task.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.preference.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    getGoogleConnection(),
    getTodaysGoogleEvents(),
    getSettings(),
  ]);
  const todayTasks = tasks.map(serializeTask).filter((t) => bucketForDate(t.date) === "today");
  const preferenceDTOs = preferences.map(serializePreference);
  const freeformPreferences = preferenceDTOs.filter((p) => !p.locked && !p.windowed);

  const preferenceBlocks = lockedPreferenceEvents(preferenceDTOs);
  const windowedBlocks = placeWindowedPreferences(preferenceDTOs, [...(googleEvents ?? []), ...preferenceBlocks]);
  const fixedEvents = [...(googleEvents ?? []), ...preferenceBlocks, ...windowedBlocks];
  const aiEvents = suggestTimeBlocks(todayTasks, fixedEvents, {
    workStart: settings.workStartMinute,
    workEnd: settings.workEndMinute,
    nowMinutes: nowMinutesInAppTZ(),
  });

  let syncedIds = new Set<string>();
  if (googleAccount) {
    const [taskSync, prefSync] = await Promise.all([
      syncTaskBlocksToGoogle(aiEvents, tasks),
      syncPreferenceBlocksToGoogle([...preferenceBlocks, ...windowedBlocks], preferences),
    ]);
    syncedIds = new Set([...taskSync, ...prefSync]);
  }

  return (
    <div>
      <header className="flex items-center justify-between border-b border-border bg-surface px-8 py-6">
        <h1 className="text-xl font-semibold tracking-tight">Time Blocks</h1>
        <GoogleConnect
          connected={Boolean(googleAccount)}
          email={googleAccount?.email ?? null}
          calendarName={googleAccount?.calendarName ?? null}
          error={google_error ?? null}
        />
      </header>
      <div className="mx-auto grid max-w-5xl gap-6 p-8 md:grid-cols-[1fr_260px]">
        <TimeBlockCalendar events={[...fixedEvents, ...aiEvents]} syncedIds={syncedIds} googleConnected={Boolean(googleAccount)} />

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
