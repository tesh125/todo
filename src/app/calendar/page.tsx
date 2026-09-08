import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/serialize";
import { bucketForDate } from "@/lib/buckets";
import { getMockGoogleEvents, suggestTimeBlocks } from "@/lib/timeBlocks";
import TimeBlockCalendar from "@/components/TimeBlockCalendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const tasks = await prisma.task.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  const todayTasks = tasks.map(serializeTask).filter((t) => bucketForDate(t.date) === "today");

  const googleEvents = getMockGoogleEvents();
  const aiEvents = suggestTimeBlocks(todayTasks, googleEvents);

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
      <div className="mx-auto max-w-3xl p-8">
        <TimeBlockCalendar events={[...googleEvents, ...aiEvents]} />
      </div>
    </div>
  );
}
