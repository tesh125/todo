import { prisma } from "@/lib/prisma";
import { serializePreference } from "@/lib/serialize";
import PreferencesBoard from "@/components/PreferencesBoard";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const preferences = await prisma.preference.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div>
      <header className="border-b border-border bg-surface px-8 py-6">
        <h1 className="text-xl font-semibold tracking-tight">Preferences</h1>
        <p className="mt-1 text-sm text-muted">
          Bullets the AI factors in when it blocks your day. Give one a specific time to lock it on the calendar —
          leave it open-ended and it&apos;s just context.
        </p>
      </header>
      <PreferencesBoard initialPreferences={preferences.map(serializePreference)} />
    </div>
  );
}
