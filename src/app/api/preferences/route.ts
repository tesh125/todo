import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const preferences = await prisma.preference.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(preferences);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const locked = body.locked === true;
  const startMinute = locked && typeof body.startMinute === "number" ? body.startMinute : null;
  const endMinute = locked && typeof body.endMinute === "number" ? body.endMinute : null;

  if (locked && (startMinute === null || endMinute === null || endMinute <= startMinute)) {
    return NextResponse.json(
      { error: "A locked preference needs a valid start and end time" },
      { status: 400 }
    );
  }

  const windowed = !locked && body.windowed === true;
  const durationMinutes = windowed && typeof body.durationMinutes === "number" ? body.durationMinutes : null;
  const windowStartMinute = windowed && typeof body.windowStartMinute === "number" ? body.windowStartMinute : null;
  const windowEndMinute = windowed && typeof body.windowEndMinute === "number" ? body.windowEndMinute : null;

  if (
    windowed &&
    (durationMinutes === null ||
      durationMinutes <= 0 ||
      windowStartMinute === null ||
      windowEndMinute === null ||
      windowEndMinute <= windowStartMinute ||
      durationMinutes > windowEndMinute - windowStartMinute)
  ) {
    return NextResponse.json(
      { error: "A non-negotiable needs a valid duration that fits inside its window" },
      { status: 400 }
    );
  }

  const preference = await prisma.preference.create({
    data: { text, locked, startMinute, endMinute, windowed, durationMinutes, windowStartMinute, windowEndMinute },
  });

  return NextResponse.json(preference, { status: 201 });
}
