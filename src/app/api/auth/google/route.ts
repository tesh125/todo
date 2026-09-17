import { NextResponse } from "next/server";
import { googleAuthUrl, isGoogleConfigured } from "@/lib/googleCalendar";

export async function GET(req: Request) {
  if (!isGoogleConfigured()) {
    const url = new URL("/calendar", req.url);
    url.searchParams.set("google_error", "not_configured");
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(googleAuthUrl());
}
