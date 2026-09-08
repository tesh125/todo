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
  around existing events.
- Drag and drop tasks between columns, check them off, or delete them.

## Status: UI-first with mock data

Google Calendar and the AI suggestion engine are both stubbed right now so the
product experience could be nailed down before wiring up real integrations:

- `src/lib/timeBlocks.ts` → `getMockGoogleEvents()` returns sample events.
  Swap this for a real Google Calendar API call once OAuth is set up
  (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` in `.env`).
- `src/lib/timeBlocks.ts` → `suggestTimeBlocks()` is a simple greedy scheduling
  heuristic. Swap this for a real Claude API call once `ANTHROPIC_API_KEY` is
  set — the function's shape (`CalendarEvent[]` in, `CalendarEvent[]` out)
  stays the same either way.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite for storage (`prisma/schema.prisma`)
- date-fns for date math

## Getting started

```bash
npm install
npm run db:push   # creates prisma/dev.db from the schema
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts:

```bash
npm run build       # production build
npm run lint        # eslint
npm run db:studio   # browse the SQLite data in Prisma Studio
```

## Data model

A single `Task` model (`prisma/schema.prisma`) holds `title`, an optional
`date` (day precision — null means "Later"), `completed`, an `order` for
manual sorting, and an optional `estimatedMinutes` used by the time-block
scheduler.
