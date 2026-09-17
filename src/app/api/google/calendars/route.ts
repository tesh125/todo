import { NextResponse } from "next/server";
import { createNewDedicatedCalendar, listGoogleCalendars, setDedicatedCalendar } from "@/lib/googleCalendar";

export async function GET() {
  const calendars = await listGoogleCalendars();
  if (calendars === null) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  return NextResponse.json({ calendars });
}

export async function PATCH(request: Request) {
  const body = await request.json();

  if (body.createNew) {
    const created = await createNewDedicatedCalendar(typeof body.name === "string" ? body.name : undefined);
    if (!created) return NextResponse.json({ error: "Failed to create calendar" }, { status: 500 });
    return NextResponse.json({ calendarId: created.id, calendarName: created.name });
  }

  const { calendarId, calendarName } = body;
  if (typeof calendarId !== "string" || typeof calendarName !== "string") {
    return NextResponse.json({ error: "calendarId and calendarName required" }, { status: 400 });
  }
  await setDedicatedCalendar(calendarId, calendarName);
  return NextResponse.json({ calendarId, calendarName });
}
