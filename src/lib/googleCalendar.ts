import { prisma } from "@/lib/prisma";
import { CalendarEvent } from "@/lib/timeBlocks";

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

/** Minutes since midnight, in the server's local time. */
function minutesFromISO(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Fetches today's events from the connected Google Calendar. Returns null if
 * no account is connected (caller should fall back to an empty calendar).
 */
export async function getTodaysGoogleEvents(): Promise<CalendarEvent[] | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

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
      start: minutesFromISO(e.start!.dateTime!),
      end: minutesFromISO(e.end!.dateTime!),
      source: "google" as const,
    }));
}
