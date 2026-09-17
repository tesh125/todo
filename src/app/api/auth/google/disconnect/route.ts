import { NextResponse } from "next/server";
import { disconnectGoogleAccount } from "@/lib/googleCalendar";

export async function POST() {
  await disconnectGoogleAccount();
  return NextResponse.json({ ok: true });
}
