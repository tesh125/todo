import { prisma } from "@/lib/prisma";
import { CalendarEvent } from "@/lib/timeBlocks";
import { minutesInAppTZFromISO, minutesTodayToUTC, todayKeyInAppTZ } from "@/lib/timezone";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
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

async function getValidAccessToken(): Promise<string | null> {
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

/**
 * Fetches today's events from the connected Google Calendar. Returns null if
 * no account is connected (caller should fall back to an empty calendar).
 */
export async function getTodaysGoogleEvents(): Promise<CalendarEvent[] | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const startOfDay = minutesTodayToUTC(0);
  const endOfDay = minutesTodayToUTC(24 * 60);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  const events: GoogleEvent[] = data.items ?? [];

  return events
    .filter((e) => e.start?.dateTime && e.end?.dateTime) // skip all-day events
    .map((e) => ({
      id: e.id,
      title: e.summary ?? "(no title)",
      start: minutesInAppTZFromISO(e.start!.dateTime!),
      end: minutesInAppTZFromISO(e.end!.dateTime!),
      source: "google" as const,
    }));
}

/**
 * Creates a real event on the connected Google Calendar for a task block
 * placed on today's Time Blocks calendar. Returns the new event's id, or
 * null if there's no connection or the request fails.
 */
export async function createGoogleEvent(title: string, startMinute: number, endMinute: number): Promise<string | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: title,
      start: { dateTime: minutesTodayToUTC(startMinute).toISOString() },
      end: { dateTime: minutesTodayToUTC(endMinute).toISOString() },
    }),
  });
  if (!res.ok) return null;

  const created = await res.json();
  return created.id ?? null;
}

/**
 * Writes any newly-placed task block to the connected Google Calendar as a
 * real event. Skips blocks that aren't task-derived (real Google events,
 * locked preferences) and tasks that already have a googleEventId, so this
 * is safe to call on every page load. Returns the ids of every task that
 * ends up with an event on Google (whether just-created or already synced),
 * so the UI can show which blocks are actually on the calendar.
 */
export async function syncTaskBlocksToGoogle(
  blocks: CalendarEvent[],
  tasks: { id: string; googleEventId: string | null }[]
): Promise<Set<string>> {
  const synced = new Set<string>();
  const account = await getGoogleConnection();
  if (!account) return synced;

  const taskById = new Map(tasks.map((t) => [t.id, t]));

  for (const block of blocks) {
    if (block.source !== "ai" || !block.id.startsWith("ai-")) continue;
    const taskId = block.id.slice(3);
    const task = taskById.get(taskId);
    if (!task) continue;

    if (task.googleEventId) {
      synced.add(taskId);
      continue;
    }

    const eventId = await createGoogleEvent(block.title, block.start, block.end);
    if (eventId) {
      await prisma.task.update({ where: { id: taskId }, data: { googleEventId: eventId } });
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

  const today = todayKeyInAppTZ();
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
