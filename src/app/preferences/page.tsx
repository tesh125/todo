import { prisma } from "@/lib/prisma";
import { serializePreference } from "@/lib/serialize";
import { getSettings } from "@/lib/settings";
import PreferencesBoard from "@/components/PreferencesBoard";
import WorkdayHours from "@/components/WorkdayHours";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const [preferences, settings] = await Promise.all([
    prisma.preference.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    getSettings(),
  ]);

  return (
    <div>
      <header className="border-b border-border bg-surface px-8 py-6">
        <h1 className="text-xl font-semibold tracking-tight">Preferences</h1>
        <p className="mt-1 text-sm text-muted">
          Bullets the AI factors in when it blocks your day. Give one a specific time to lock it on the calendar, or
          leave it open-ended so it&apos;s just context.
        </p>
      </header>
      <div className="mx-auto max-w-2xl px-8 pt-8">
        <WorkdayHours initialSettings={settings} />
      </div>
      <PreferencesBoard initialPreferences={preferences.map(serializePreference)} workStartMinute={settings.workStartMinute} />
    </div>
  );
}
