import { prisma } from "@/lib/prisma";
import { serializePreference, serializeTask } from "@/lib/serialize";
import TodoBoard from "@/components/TodoBoard";

export const dynamic = "force-dynamic";

export default async function TodoPage() {
  const [tasks, preferences] = await Promise.all([
    prisma.task.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.preference.findMany({
      where: { OR: [{ locked: true }, { windowed: true }] },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return (
    <div>
      <header className="border-b border-border bg-surface px-8 py-6">
        <h1 className="text-xl font-semibold tracking-tight">Today, Tomorrow, Later</h1>
        <p className="mt-1 text-sm text-muted">
          Anything left in Tomorrow moves itself into Today the moment the day turns over.
        </p>
      </header>
      <TodoBoard initialTasks={tasks.map(serializeTask)} initialDaily={preferences.map(serializePreference)} />
    </div>
  );
}
