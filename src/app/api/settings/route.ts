import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

const SINGLETON_ID = "singleton";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();

  const data: { workStartMinute?: number; workEndMinute?: number } = {};
  if (typeof body.workStartMinute === "number") data.workStartMinute = body.workStartMinute;
  if (typeof body.workEndMinute === "number") data.workEndMinute = body.workEndMinute;

  if (
    data.workStartMinute !== undefined &&
    data.workEndMinute !== undefined &&
    data.workEndMinute <= data.workStartMinute
  ) {
    return NextResponse.json({ error: "Workday end has to be after the start" }, { status: 400 });
  }

  const settings = await prisma.settings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });

  return NextResponse.json({ workStartMinute: settings.workStartMinute, workEndMinute: settings.workEndMinute });
}
