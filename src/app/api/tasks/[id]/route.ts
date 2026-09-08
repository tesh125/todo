import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Bucket, dateForBucket } from "@/lib/buckets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const data: {
    title?: string;
    notes?: string | null;
    completed?: boolean;
    completedAt?: Date | null;
    date?: Date | null;
    order?: number;
    estimatedMinutes?: number | null;
  } = {};

  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.notes === "string" || body.notes === null) data.notes = body.notes;
  if (typeof body.completed === "boolean") {
    data.completed = body.completed;
    data.completedAt = body.completed ? new Date() : null;
  }
  if (body.bucket === "today" || body.bucket === "tomorrow" || body.bucket === "later") {
    data.date = dateForBucket(body.bucket as Bucket);
  }
  if (typeof body.order === "number") data.order = body.order;
  if (typeof body.estimatedMinutes === "number" || body.estimatedMinutes === null) {
    data.estimatedMinutes = body.estimatedMinutes;
  }

  const task = await prisma.task.update({ where: { id }, data });
  return NextResponse.json(task);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
