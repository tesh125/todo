import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Bucket, dateForBucket } from "@/lib/buckets";
import { estimateDurationForTask } from "@/lib/aiScheduler";

export async function GET() {
  const tasks = await prisma.task.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const bucket: Bucket = body.bucket === "today" || body.bucket === "tomorrow" ? body.bucket : "later";

  // Guess a time allotment right away — Sonnet if configured, the keyword
  // heuristic otherwise — so every task shows an estimate the moment it's
  // added; the user can still adjust it afterward (PATCH estimatedMinutes).
  const estimatedMinutes =
    typeof body.estimatedMinutes === "number" ? body.estimatedMinutes : await estimateDurationForTask(title);

  const task = await prisma.task.create({
    data: {
      title,
      date: dateForBucket(bucket),
      estimatedMinutes,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
