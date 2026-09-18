# Todo Blocker

A todo list that rolls itself forward, plus a time-blocked calendar view.

## What's here

- **Today / Tomorrow / Later board**: three columns of tasks. Anything scheduled
  for "Tomorrow" moves itself into "Today" the moment the day turns over. There's
  no midnight job: each task just stores a date, and the bucket it appears in
  (Today / Tomorrow / Later) is derived live by comparing that date to the
  current date on every page load. See `src/lib/buckets.ts`.
- **Time Blocks page**: a day-view calendar showing your real Google Calendar
  events (once connected) alongside AI-suggested time blocks for today's open
  tasks, dropped into the free gaps around existing events and any locked
  preference (see below).
- **Preferences page**: bullets the AI factors in when it blocks your day.
  Give one a specific time (e.g. "Breakfast, 7:00-7:30") and it becomes a hard
  block on the calendar that nothing else can be scheduled over. Leave it
  open-ended (e.g. "prefer deep work in the morning") and it's just free-text
  context the scheduler reads alongside your tasks.
- Drag and drop tasks between columns, check them off, or delete them.

## Google Calendar

Connect from the Time Blocks page. That kicks off a normal OAuth login, then
the app reads your real events for today from your main calendar (so it
knows what's busy), and writes every AI-placed and preference block as a
real event onto its own dedicated calendar named "Todo Blocker" (created
automatically on first sync) rather than cluttering your main one. Setup
needs three env vars:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` from a Google Cloud OAuth client
- `GOOGLE_REDIRECT_URI` set to `<your app's base URL>/api/auth/google/callback`

If you connected before the dedicated calendar was added, disconnect and
reconnect once from the Time Blocks page — creating a calendar needs the
broader `calendar` OAuth scope, which only takes effect on a fresh consent.

See `src/lib/googleCalendar.ts` for the OAuth + Calendar API calls.

## Importing from Apple Notes

Apple doesn't have a public API for Notes, so there's no real sync — but
`POST /api/import` accepts freeform text and creates tasks from it, which an
Apple Shortcut can call. It expects "Today" / "Tomorrow" / "Later" section
headers (matching a typical Apple Notes layout) followed by one task per
line, bulleted or not; anything before the first header is filed under
"Later". Re-running the same note is safe — a line whose text matches an
existing open task is skipped rather than duplicated.

Setup:

1. Set `IMPORT_SECRET` to any random string (env var, both locally and on
   Vercel). The endpoint is disabled entirely if it's unset.
2. In the Shortcuts app, build a shortcut:
   - **Find Notes** (or **Get Note**) → find your Today/Tomorrow/Later note
     by name, and get its **Plain Text** content.
   - **Get Contents of URL**: `POST` to
     `https://todo-six-theta-99.vercel.app/api/import`
     - Header `Authorization`: `Bearer <your IMPORT_SECRET>`
     - Request body (JSON): `{ "text": <the note's plain text> }`
3. Run the shortcut whenever you want to pull the note in — manually, from
   the Shortcuts widget, or via a personal automation (e.g. every morning).

See `src/lib/importNotes.ts` for the parser and `src/app/api/import/route.ts`
for the endpoint.

## AI scheduling

`src/lib/aiScheduler.ts` → `suggestTimeBlocksWithAI()` sends the day's open
tasks, what's already busy (real events + locked/windowed preferences +
explicit-time tasks), and your freeform preference text to Claude
(`claude-sonnet-5`, structured outputs), and asks it to reason about a
realistic duration per task, sensible spacing, and where to drop in a walk
break — instead of the flat keyword rules in `src/lib/timeBlocks.ts` →
`suggestTimeBlocks()`. Every block the model proposes is re-validated
server-side against the busy list before being trusted, so a hallucinated
or overlapping placement gets dropped rather than double-booked.

Requires `ANTHROPIC_API_KEY`. Without it — or if the API call fails for any
reason — it falls back to the heuristic scheduler automatically, so the page
never breaks either way.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + Postgres for storage (`prisma/schema.prisma`)
- date-fns for date math

## Getting started

```bash
npm install
```

Point `STORE_DATABASE_URL` in `.env` at a Postgres database (a free
[Neon](https://neon.tech) or [Supabase](https://supabase.com) project works
fine for local dev, see `.env.example` for the connection string format),
then:

```bash
npm run db:push   # syncs the schema to that database
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts:

```bash
npm run build       # syncs the schema, then a production build
npm run lint        # eslint
npm run db:studio   # browse the data in Prisma Studio
```

## Deploying on Vercel

Live at **todo-six-theta-99.vercel.app**, linked to the `todo` Vercel project,
which redeploys automatically on every push to `main`. The build itself also
runs `prisma db push`, so schema changes deploy automatically too, no manual
step needed.

Note the database env var isn't named `DATABASE_URL`: Vercel's Neon
marketplace integration prefixes every var it creates with the storage
resource's name, so it's `STORE_DATABASE_URL` here. The Prisma schema
(`prisma/schema.prisma`) reads that exact name; update it there if you ever
reconnect a different database resource.

## Data model

- `Task` (`prisma/schema.prisma`): `title`, an optional `date` (day precision,
  null means "Later"), `completed`, an `order` for manual sorting, and an
  optional `estimatedMinutes` used by the time-block scheduler.
- `Preference`: `text`, `locked` (whether it's a hard calendar block), and
  `startMinute`/`endMinute` (minutes since midnight) when locked.
- `GoogleAccount`: a single row holding the connected Google account's OAuth
  tokens (this is a personal single-user app).
