import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateForBucket } from "@/lib/buckets";
import { parseImportText } from "@/lib/importNotes";

/**
 * One-way import from outside the app (e.g. an Apple Shortcut reading a
 * note), not a real sync: nothing here flows back out. Protected by a
 * shared secret since it's a public URL that creates data on a POST.
 */
export async function POST(request: Request) {
  const secret = process.env.IMPORT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "IMPORT_SECRET is not configured" }, { status: 501 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing \"text\"" }, { status: 400 });
  }

  const parsed = parseImportText(text);

  // Skip anything that already exists as an open task, so re-running the
  // same note (e.g. a daily Shortcut) doesn't pile up duplicates.
  const existing = await prisma.task.findMany({ where: { completed: false }, select: { title: true } });
  const seenTitles = new Set(existing.map((t) => t.title.trim()));

  let created = 0;
  let skipped = 0;

  for (const bucket of ["today", "tomorrow", "later"] as const) {
    for (const title of parsed[bucket]) {
      if (seenTitles.has(title)) {
        skipped++;
        continue;
      }
      await prisma.task.create({ data: { title, date: dateForBucket(bucket) } });
      seenTitles.add(title);
      created++;
    }
  }

  return NextResponse.json({ created, skipped });
}
