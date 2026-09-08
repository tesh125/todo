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

  const preference = await prisma.preference.create({
    data: { text, locked, startMinute, endMinute },
  });

  return NextResponse.json(preference, { status: 201 });
}
