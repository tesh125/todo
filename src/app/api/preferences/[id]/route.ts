import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const data: {
    text?: string;
    locked?: boolean;
    startMinute?: number | null;
    endMinute?: number | null;
    windowed?: boolean;
    durationMinutes?: number | null;
    windowStartMinute?: number | null;
    windowEndMinute?: number | null;
    order?: number;
  } = {};

  if (typeof body.text === "string") data.text = body.text.trim();
  if (typeof body.locked === "boolean") {
    data.locked = body.locked;
    if (!body.locked) {
      data.startMinute = null;
      data.endMinute = null;
    }
  }
  if (typeof body.startMinute === "number" || body.startMinute === null) data.startMinute = body.startMinute;
  if (typeof body.endMinute === "number" || body.endMinute === null) data.endMinute = body.endMinute;
  if (typeof body.windowed === "boolean") {
    data.windowed = body.windowed;
    if (!body.windowed) {
      data.durationMinutes = null;
      data.windowStartMinute = null;
      data.windowEndMinute = null;
    }
  }
  if (typeof body.durationMinutes === "number" || body.durationMinutes === null) data.durationMinutes = body.durationMinutes;
  if (typeof body.windowStartMinute === "number" || body.windowStartMinute === null) data.windowStartMinute = body.windowStartMinute;
  if (typeof body.windowEndMinute === "number" || body.windowEndMinute === null) data.windowEndMinute = body.windowEndMinute;
  if (typeof body.order === "number") data.order = body.order;

  const preference = await prisma.preference.update({ where: { id }, data });
  return NextResponse.json(preference);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.preference.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
