# PR Synthesizer — Phase 1: PERN Skeleton

This is the foundation for the A2A Pull Request Review Synthesizer. At this
stage there's **no AI, no agents, no GitHub webhooks** — just a working
Express + PostgreSQL + React app showing dummy review data. The goal is to
get something running end-to-end and shake the rust off PERN before we layer
on the more advanced pieces.

```
pr-synthesizer/
├── server/   Express API + PostgreSQL
└── client/   React (Vite) dashboard
```

## Prerequisites

- Node.js 18 or newer
- PostgreSQL installed and running locally

## 1. Create the database

Using `psql` (or any Postgres client / GUI you prefer):

```bash
createdb pr_synthesizer
psql -d pr_synthesizer -f server/sql/schema.sql
psql -d pr_synthesizer -f server/sql/seed.sql
```

This creates one table, `pr_reviews`, and inserts 4 dummy rows with different
statuses (`pending`, `working`, `completed`, `failed`) so the UI has
something to show immediately.

## 2. Run the server

```bash
cd server
cp .env.example .env
# edit .env if your Postgres user/password/db name differ from the defaults
npm install
npm run dev
```

You should see:

```
PR Synthesizer server running on http://localhost:5000
```

Sanity check it's working:

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/reviews
```

## 3. Run the client

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). You should see a
dark "mission control" dashboard listing the 4 dummy PR reviews with status
badges, and clicking one shows its detail page with a synthesized review
summary (or a placeholder if there isn't one yet).

## Troubleshooting

- **"Couldn't reach the server" in the browser** — make sure `npm run dev`
  is running in `server/` and that `DATABASE_URL` in `server/.env` matches
  your local Postgres setup (username, password, port, database name).
- **`relation "pr_reviews" does not exist`** — you skipped step 1, or ran it
  against a different database than the one in `DATABASE_URL`.

## API reference (so far)

| Method | Endpoint            | Description                         |
| ------ | ------------------- | ------------------------------------ |
| GET    | `/api/health`        | Health check                          |
| GET    | `/api/reviews`       | List all reviews, newest first        |
| GET    | `/api/reviews/:id`   | Get a single review                   |
| POST   | `/api/reviews`       | Create a new review record            |
| PATCH  | `/api/reviews/:id`   | Update a review's status/summary      |

The `POST` and `PATCH` endpoints aren't used by the UI yet — they're there
ready for Phase 2 (a script that calls the Gemini API on a real code diff and
writes the result here) and Phase 6 (agents updating status live).

## What's next — Phase 2

Write a small standalone Node script that sends a code diff to the Gemini
API and gets back structured JSON describing issues found. Once that works
on its own, wire it into a new endpoint (e.g. `POST /api/reviews/:id/analyze`)
that calls it and then `PATCH`es the review with the result. Come back here
once Phase 1 is running and we'll build that together.
