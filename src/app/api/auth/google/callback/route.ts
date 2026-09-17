import { NextResponse } from "next/server";
import { exchangeCodeForTokens, saveGoogleAccount } from "@/lib/googleCalendar";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const redirectTo = new URL("/calendar", req.url);

  if (error) {
    redirectTo.searchParams.set("google_error", error);
    return NextResponse.redirect(redirectTo);
  }
  if (!code) {
    redirectTo.searchParams.set("google_error", "missing_code");
    return NextResponse.redirect(redirectTo);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveGoogleAccount(tokens);
  } catch {
    redirectTo.searchParams.set("google_error", "connect_failed");
    return NextResponse.redirect(redirectTo);
  }

  return NextResponse.redirect(redirectTo);
}
