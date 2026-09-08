import { prisma } from "@/lib/prisma";
import { serializePreference, serializeTask } from "@/lib/serialize";
import { bucketForDate } from "@/lib/buckets";
import { getMockGoogleEvents, lockedPreferenceEvents, suggestTimeBlocks } from "@/lib/timeBlocks";
import TimeBlockCalendar from "@/components/TimeBlockCalendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [tasks, preferences] = await Promise.all([
    prisma.task.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.preference.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
  ]);
  const todayTasks = tasks.map(serializeTask).filter((t) => bucketForDate(t.date) === "today");
  const preferenceDTOs = preferences.map(serializePreference);
  const freeformPreferences = preferenceDTOs.filter((p) => !p.locked);

  const googleEvents = getMockGoogleEvents();
  const preferenceBlocks = lockedPreferenceEvents(preferenceDTOs);
  const fixedEvents = [...googleEvents, ...preferenceBlocks];
  const aiEvents = suggestTimeBlocks(todayTasks, fixedEvents);

  return (
    <div>
      <header className="border-b border-border bg-surface px-8 py-6">
        <h1 className="text-xl font-semibold tracking-tight">Time Blocks</h1>
        <p className="mt-1 text-sm text-muted">
          Your Google Calendar for today, with an AI-suggested block for each open task that hasn&apos;t been scheduled yet.
        </p>
        <p className="mt-2 text-xs text-muted">
          Calendar shown here is sample data — Google Calendar sync and the real AI suggestion model connect in next.
        </p>
      </header>
      <div className="mx-auto grid max-w-5xl gap-6 p-8 md:grid-cols-[1fr_260px]">
        <TimeBlockCalendar events={[...fixedEvents, ...aiEvents]} />

        <aside className="flex flex-col gap-3">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-1 text-[13px] font-semibold">What the AI is reading</h2>
            <p className="mb-3 text-[11.5px] text-muted">
              Free-text preferences factored into scheduling, alongside each task&apos;s title and duration.
            </p>
            {freeformPreferences.length === 0 ? (
              <p className="text-[12px] text-muted">
                No general preferences yet — add some on the{" "}
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
