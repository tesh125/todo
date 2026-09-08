# Blocker

A todo list that rolls itself forward, plus a time-blocked calendar view.

## What's here

- **Today / Tomorrow / Later board** — three columns of tasks. Anything scheduled
  for "Tomorrow" moves itself into "Today" the moment the day turns over. There's
  no midnight job: each task just stores a date, and the bucket it appears in
  (Today / Tomorrow / Later) is derived live by comparing that date to the
  current date on every page load. See `src/lib/buckets.ts`.
- **Time Blocks page** — a day-view calendar showing calendar events alongside
  AI-suggested time blocks for today's open tasks, dropped into the free gaps
  around existing events and around any locked preference (see below).
- **Preferences page** — bullets the AI factors in when it blocks your day.
  Give one a specific time (e.g. "Breakfast, 7:00–7:30") and it becomes a hard
  block on the calendar that nothing else can be scheduled over. Leave it
  open-ended (e.g. "prefer deep work in the morning") and it's just free-text
  context the scheduler reads alongside your tasks.
- Drag and drop tasks between columns, check them off, or delete them.

## Status: UI-first with mock data

Google Calendar and the AI suggestion engine are both stubbed right now so the
product experience could be nailed down before wiring up real integrations:

- `src/lib/timeBlocks.ts` → `getMockGoogleEvents()` returns sample events.
  Swap this for a real Google Calendar API call once OAuth is set up
  (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` in `.env`).
- `src/lib/timeBlocks.ts` → `suggestTimeBlocks()` is a simple greedy scheduling
  heuristic that only knows about start times, not time-of-day semantics.
  Swap this for a real Claude API call once `ANTHROPIC_API_KEY` is set, passing
  it today's tasks + locked preference blocks + freeform preference text as
  context — the function's shape (`CalendarEvent[]` in, `CalendarEvent[]` out)
  stays the same either way.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + Postgres for storage (`prisma/schema.prisma`)
- date-fns for date math

## Getting started

```bash
npm install
```

Point `DATABASE_URL` in `.env` at a Postgres database (a free
[Neon](https://neon.tech) or [Supabase](https://supabase.com) project works
fine for local dev — see `.env.example` for the connection string format),
then:

```bash
npm run db:push   # syncs the schema to that database
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts:

```bash
npm run build       # production build
npm run lint        # eslint
npm run db:studio   # browse the data in Prisma Studio
```

## Deploying on Vercel

The project is linked to Vercel and redeploys automatically on every push to
`main`. One manual step is required before the live site will actually work:
Vercel's serverless functions have no persistent disk, so the app needs a
real Postgres database, not a local file.

1. In the Vercel dashboard, open this project → **Storage** tab.
2. Add a Postgres database (the Neon integration has a free tier — no separate
   sign-up needed, it's built into Vercel's marketplace).
3. Connecting it adds a `DATABASE_URL` (or similar) env var to the project
   automatically. Make sure a variable named exactly `DATABASE_URL` is set —
   rename/alias it if the integration used a different name.
4. Redeploy (or just push a commit) so the new env var takes effect.

Until that's done, pages that touch the database will build fine but error at
request time.

## Data model

- `Task` (`prisma/schema.prisma`) — `title`, an optional `date` (day
  precision — null means "Later"), `completed`, an `order` for manual sorting,
  and an optional `estimatedMinutes` used by the time-block scheduler.
- `Preference` — `text`, `locked` (whether it's a hard calendar block), and
  `startMinute`/`endMinute` (minutes since midnight) when locked.
