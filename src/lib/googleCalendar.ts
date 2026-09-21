import { prisma } from "@/lib/prisma";
import { CalendarEvent } from "@/lib/timeBlocks";
import { dayKeyInAppTZ, dayMidnightUTC, minutesInAppTZFromISO, minutesOnDayToUTC } from "@/lib/timezone";

// Needs the full "calendar" scope (not just calendar.events) because
// creating the dedicated "Todo Blocker" calendar itself requires
// calendar-management access, on top of reading/writing events.
const SCOPE = "https://www.googleapis.com/auth/calendar";
const SINGLETON_ID = "singleton";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI
  );
}

export function googleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email ?? null;
}

export async function saveGoogleAccount(tokens: TokenResponse) {
  if (!tokens.refresh_token) {
    // Google only sends a refresh_token on the first consent; if the app was
    // already connected, reuse the one already stored.
    const existing = await prisma.googleAccount.findUnique({ where: { id: SINGLETON_ID } });
    if (!existing) throw new Error("No refresh token returned and no existing connection to fall back on");
    tokens.refresh_token = existing.refreshToken;
  }

  const email = await fetchGoogleEmail(tokens.access_token);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.googleAccount.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    },
    update: {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    },
  });
}

export async function disconnectGoogleAccount() {
  await prisma.googleAccount.deleteMany({ where: { id: SINGLETON_ID } });
}

export async function getGoogleConnection() {
  return prisma.googleAccount.findUnique({ where: { id: SINGLETON_ID } });
}

export async function getValidAccessToken(): Promise<string | null> {
  const account = await prisma.googleAccount.findUnique({ where: { id: SINGLETON_ID } });
  if (!account) return null;

  if (account.expiresAt.getTime() > Date.now() + 60_000) {
    return account.accessToken;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: account.refreshToken,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;

  const refreshed: TokenResponse = await res.json();
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await prisma.googleAccount.update({
    where: { id: SINGLETON_ID },
    data: { accessToken: refreshed.access_token, expiresAt },
  });
  return refreshed.access_token;
}

type GoogleEvent = {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const DEDICATED_CALENDAR_NAME = "Todo Blocker";

async function createCalendarOnGoogle(accessToken: string, name: string): Promise<{ id: string; name: string } | null> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: name }),
  });
  if (!res.ok) return null;

  const created = await res.json();
  const calendarId: string | undefined = created.id;
  if (!calendarId) return null;

  await prisma.googleAccount.update({
    where: { id: SINGLETON_ID },
    data: { calendarId, calendarName: name },
  });

  return { id: calendarId, name };
}

/**
 * Every block the app creates goes on its own dedicated calendar instead of
 * the user's main one, so it never clutters their real calendar. Finds the
 * existing one by id if already known (whether auto-created or explicitly
 * picked by the user), otherwise creates a new "Todo Blocker" calendar and
 * caches the id. The main calendar is still read separately
 * (getGoogleEventsForDay) to know what's busy.
 */
async function getOrCreateDedicatedCalendarId(accessToken: string): Promise<string | null> {
  const account = await prisma.googleAccount.findUnique({ where: { id: SINGLETON_ID } });
  if (account?.calendarId) return account.calendarId;

  const created = await createCalendarOnGoogle(accessToken, DEDICATED_CALENDAR_NAME);
  return created?.id ?? null;
}

export type GoogleCalendarOption = {
  id: string;
  name: string;
  primary: boolean;
};

/**
 * Lists the user's Google calendars that the app could plausibly write to
 * (anything they own or can edit), so the UI can offer a picker instead of
 * always auto-creating a brand new "Todo Blocker" calendar.
 */
export async function listGoogleCalendars(): Promise<GoogleCalendarOption[] | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  const items: { id: string; summary?: string; primary?: boolean; accessRole?: string }[] = data.items ?? [];

  return items
    .filter((c) => c.accessRole === "owner" || c.accessRole === "writer")
    .map((c) => ({ id: c.id, name: c.summary ?? c.id, primary: Boolean(c.primary) }));
}

/** Points the app at an existing calendar the user picked, instead of a newly-created one. */
export async function setDedicatedCalendar(calendarId: string, calendarName: string) {
  await prisma.googleAccount.update({
    where: { id: SINGLETON_ID },
    data: { calendarId, calendarName },
  });
}

/** Creates a fresh calendar (default name "Todo Blocker") and points the app at it. */
export async function createNewDedicatedCalendar(name: string = DEDICATED_CALENDAR_NAME) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;
  return createCalendarOnGoogle(accessToken, name);
}

async function listAllCalendarIds(accessToken: string): Promise<string[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return ["primary"];

  const data = await res.json();
  const items: { id: string }[] = data.items ?? [];
  return items.length > 0 ? items.map((c) => c.id) : ["primary"];
}

/**
 * Fetches a day's events across *every* calendar the user has (not just the
 * main one), so the Time Blocks view is a true picture of the day instead of
 * missing anything living on a secondary calendar. offsetDays: 0 = today,
 * 1 = tomorrow, etc. Returns null if no account is connected (caller should
 * fall back to an empty calendar).
 */
export async function getGoogleEventsForDay(offsetDays: number): Promise<CalendarEvent[] | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const startOfDay = dayMidnightUTC(offsetDays);
  const endOfDay = minutesOnDayToUTC(offsetDays, 24 * 60);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const calendarIds = await listAllCalendarIds(accessToken);

  const perCalendar = await Promise.all(
    calendarIds.map(async (calendarId) => {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items ?? []) as GoogleEvent[];
    })
  );

  // The same event can appear on more than one calendar (e.g. an invite the
  // user is also the organizer of), so dedupe by id.
  const byId = new Map<string, GoogleEvent>();
  for (const event of perCalendar.flat()) {
    if (event.start?.dateTime && event.end?.dateTime) byId.set(event.id, event); // skip all-day events
  }

  return Array.from(byId.values()).map((e) => ({
    id: e.id,
    title: e.summary ?? "(no title)",
    start: minutesInAppTZFromISO(e.start!.dateTime!),
    end: minutesInAppTZFromISO(e.end!.dateTime!),
    source: "google" as const,
  }));
}

/**
 * Looks for an event already sitting on the given calendar, that day, with
 * this exact title — so createGoogleEvent can adopt (and, if needed,
 * reschedule) it instead of making a duplicate. Matches on title alone
 * within the whole day, *not* an exact time slot: the AI plan gets
 * recomputed from scratch on every Time Blocks page load, so the same task
 * can land at a slightly different time on two different loads, and an
 * exact-time match would miss that and create a second event. Also covers
 * cases the googleEventId dedup alone wouldn't — e.g. the DB's
 * googleEventId getting lost or reset, or two sync calls racing each
 * other — by checking the live calendar itself, not just our own record of
 * what we already did.
 */
async function findExistingEventForTitle(
  accessToken: string,
  calendarId: string,
  title: string,
  offsetDays: number
): Promise<{ id: string; startMinute: number; endMinute: number } | null> {
  const params = new URLSearchParams({
    timeMin: dayMidnightUTC(offsetDays).toISOString(),
    timeMax: minutesOnDayToUTC(offsetDays, 24 * 60).toISOString(),
    singleEvents: "true",
    q: title,
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const items: GoogleEvent[] = data.items ?? [];

  const match = items.find((e) => e.summary === title && e.start?.dateTime && e.end?.dateTime);
  if (!match?.start?.dateTime || !match?.end?.dateTime) return null;

  return {
    id: match.id,
    startMinute: minutesInAppTZFromISO(match.start.dateTime),
    endMinute: minutesInAppTZFromISO(match.end.dateTime),
  };
}

/** Moves an existing event to a new time slot on the same day. */
async function updateGoogleEventTime(
  accessToken: string,
  calendarId: string,
  eventId: string,
  startMinute: number,
  endMinute: number,
  offsetDays: number
): Promise<void> {
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      start: { dateTime: minutesOnDayToUTC(offsetDays, startMinute).toISOString() },
      end: { dateTime: minutesOnDayToUTC(offsetDays, endMinute).toISOString() },
    }),
  });
}

/**
 * Creates a real event on the connected Google Calendar for a task block
 * placed on the Time Blocks calendar — or, if one with the same title
 * already exists there that day, reuses that one instead of creating a
 * duplicate (rescheduling it first if the AI moved the task to a different
 * time since it was created). offsetDays: 0 = today, 1 = tomorrow, etc.
 * Returns null if there's no connection or the request fails.
 */
export async function createGoogleEvent(
  title: string,
  startMinute: number,
  endMinute: number,
  offsetDays: number = 0
): Promise<string | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const calendarId = await getOrCreateDedicatedCalendarId(accessToken);
  if (!calendarId) return null;

  const existing = await findExistingEventForTitle(accessToken, calendarId, title, offsetDays);
  if (existing) {
    if (existing.startMinute !== startMinute || existing.endMinute !== endMinute) {
      await updateGoogleEventTime(accessToken, calendarId, existing.id, startMinute, endMinute, offsetDays);
    }
    return existing.id;
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: title,
        start: { dateTime: minutesOnDayToUTC(offsetDays, startMinute).toISOString() },
        end: { dateTime: minutesOnDayToUTC(offsetDays, endMinute).toISOString() },
      }),
    }
  );
  if (!res.ok) return null;

  const created = await res.json();
  return created.id ?? null;
}

/**
 * Removes an event from the app's dedicated calendar. Used to clear out a
 * task's stale event once its slot has moved to a new day. A 404/410 from
 * Google (already gone) isn't treated as a failure — either way, the event
 * no longer exists, which is exactly what's wanted.
 */
async function deleteGoogleEvent(eventId: string): Promise<void> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return;

  const calendarId = await getOrCreateDedicatedCalendarId(accessToken);
  if (!calendarId) return;

  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Writes any newly-placed task block to the connected Google Calendar as a
 * real event. offsetDays: 0 = today, 1 = tomorrow, etc.
 *
 * A task's googleEventId is paired with googleEventDate (same idea as
 * syncPreferenceBlocksToGoogle below): if the stored event is already dated
 * for *this* sync's day, it's left alone. But if the task carries an event
 * from an earlier day — it didn't get done, so it rolled forward into today
 * (see bucketForDate) instead of getting a fresh slot — that stale event is
 * deleted before a new one is created for today, so it doesn't linger in
 * the past on the real calendar. A task with a googleEventId but no
 * googleEventDate (set before this tracking existed) is treated as unknown
 * rather than stale: a new event is still created for today, but the old
 * one is left alone since there's no way to tell whether it's actually
 * outdated.
 *
 * Skips blocks that aren't task-derived (real Google events, locked
 * preferences). Returns the ids of every task that ends up with an event on
 * Google for this day (whether just-created or already synced), so the UI
 * can show which blocks are actually on the calendar.
 */
export async function syncTaskBlocksToGoogle(
  blocks: CalendarEvent[],
  tasks: { id: string; googleEventId: string | null; googleEventDate: string | null }[],
  offsetDays: number = 0
): Promise<Set<string>> {
  const synced = new Set<string>();
  const account = await getGoogleConnection();
  if (!account) return synced;

  const dayKey = dayKeyInAppTZ(offsetDays);
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  for (const block of blocks) {
    if (block.source !== "ai" || !block.id.startsWith("ai-")) continue;
    const taskId = block.id.slice(3);
    const task = taskById.get(taskId);
    if (!task) continue;

    if (task.googleEventId && task.googleEventDate === dayKey) {
      synced.add(taskId);
      continue;
    }

    if (task.googleEventId && task.googleEventDate && task.googleEventDate !== dayKey) {
      await deleteGoogleEvent(task.googleEventId);
    }

    const eventId = await createGoogleEvent(block.title, block.start, block.end, offsetDays);
    if (eventId) {
      await prisma.task.update({ where: { id: taskId }, data: { googleEventId: eventId, googleEventDate: dayKey } });
      synced.add(taskId);
    }
  }

  return synced;
}

/**
 * Same idea as syncTaskBlocksToGoogle, but for preference-derived blocks
 * (locked exact-time and windowed non-negotiables). Unlike a task, a
 * preference recurs every day and a windowed one can land at a different
 * time each day, so "already has a googleEventId" isn't enough to skip —
 * it only counts if that event was created *for today*. A new day means a
 * fresh event.
 */
export async function syncPreferenceBlocksToGoogle(
  blocks: CalendarEvent[],
  preferences: { id: string; googleEventId: string | null; googleEventDate: string | null }[]
): Promise<Set<string>> {
  const synced = new Set<string>();
  const account = await getGoogleConnection();
  if (!account) return synced;

  const today = dayKeyInAppTZ(0);
  const prefById = new Map(preferences.map((p) => [p.id, p]));

  for (const block of blocks) {
    if (block.source !== "preference" || !block.id.startsWith("pref-")) continue;
    const prefId = block.id.slice(5);
    const pref = prefById.get(prefId);
    if (!pref) continue;

    if (pref.googleEventId && pref.googleEventDate === today) {
      synced.add(prefId);
      continue;
    }

    const eventId = await createGoogleEvent(block.title, block.start, block.end);
    if (eventId) {
      await prisma.preference.update({ where: { id: prefId }, data: { googleEventId: eventId, googleEventDate: today } });
      synced.add(prefId);
    }
  }

  return synced;
}

/**
 * Writes the scheduler's suggested walk/rest breaks to the connected Google
 * Calendar too — these were previously shown only in the in-app Time Blocks
 * view and never actually synced. A break isn't backed by a DB row the way
 * a Task or Preference is, so there's no googleEventId to track; instead
 * this always syncs under the fixed title "Walk break" regardless of
 * whatever specific wording the AI scheduler used for the block in-app
 * (which can vary between reloads) — a stable title is what lets
 * createGoogleEvent's title+day dedup recognize "this is the same break"
 * across page loads and reschedule it in place, instead of creating a new
 * Google event every time the wording happens to change.
 */
export async function syncBreakBlocksToGoogle(blocks: CalendarEvent[], offsetDays: number = 0): Promise<Set<string>> {
  const synced = new Set<string>();
  const account = await getGoogleConnection();
  if (!account) return synced;

  for (const block of blocks) {
    if (block.source !== "break") continue;
    const eventId = await createGoogleEvent("Walk break", block.start, block.end, offsetDays);
    if (eventId) synced.add(block.id);
  }

  return synced;
}
