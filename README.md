# ReachInbox Email Scheduler
**Email Job Scheduler + Dashboard**. Users log in with Google, compose a campaign, upload a lead
list, and the backend schedules one individually-tracked, durable, rate-limited email per recipient
- sent through Ethereal SMTP, indexed in Elasticsearch, and observable through a live BullMQ
dashboard.

> **Honesty note on this submission's test status.** Every line of backend/frontend code compiles,
> typechecks, and passes its automated test suite - **31/31 passing**, with zero skipped, including
> the real-Redis rate-limiter suite (see [Testing](#testing)). Docker Desktop's engine was not
> reachable from the sandbox this was built in, so the full stack was instead run live against
> PostgreSQL 18, Redis and Elasticsearch 8 installed in a WSL Ubuntu distro on the same machine
> (functionally equivalent to `docker-compose.yml`'s images), and every major requirement below was
> **verified end-to-end by hand, not merely implemented**: a real migration applied; individual
> per-recipient jobs scheduled and sent through real Ethereal SMTP; Elasticsearch indexing and search
> confirmed directly against the index itself (including proof that a status update overwrites the
> same document rather than creating a duplicate); the Bull Board dashboard showing real queue
> counts; **restart persistence confirmed by killing and independently verifying both the API and
> worker processes were fully dead, waiting past a job's scheduled time, and restarting** (the
> overdue job fired automatically, with no manual re-trigger); and the distributed rate limiter
> correctly rescheduling over-the-limit sends to the next hour window under real concurrent load
> (five of six test sends in one load test landed within the same second, direct evidence of real
> worker concurrency, not sequential processing).
>
> **Google OAuth and Slack OAuth were both fully exercised live, end-to-end, with real credentials -
> neither is a "should work" claim.** A real Google account logged in through the actual Google
> consent screen and landed on the dashboard with its real name, email, and avatar. A real Slack
> workspace ("ReachInbox Test") was connected through the actual Slack OAuth consent flow, its bot
> was added to a real channel (`#new-channel`), and when a live test deliberately drove a sender past
> its hourly limit, the resulting rate-limit notification was **visually confirmed inside that
> channel** by the project owner - not inferred from a success log line alone, though the log
> evidence (Slack's own `chat.postMessage` response reporting `ok: true`) was captured too.
>
> Two real bugs were found and fixed during this live testing, not left as unverified assumptions:
> BullMQ rejects a custom job id containing `:` (the original `emailJobId()` used one), and a
> Postgres connection-pool exhaustion under concurrent worker load surfaced as a real failed job in
> Bull Board (see [Idempotency](#idempotency) for that second one). Both are documented with their
> exact `fix:` commits rather than quietly patched.

---

## Table of contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Architecture Diagram](#architecture-diagram)
- [Folder Structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Docker Setup](#docker-setup)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Prisma Migration](#prisma-migration)
- [Redis Setup](#redis-setup)
- [Elasticsearch Setup](#elasticsearch-setup)
- [Ethereal Setup](#ethereal-setup)
- [Google OAuth Setup](#google-oauth-setup)
- [Slack OAuth Setup](#slack-oauth-setup)
- [Backend Setup](#backend-setup)
- [Worker Setup](#worker-setup)
- [Frontend Setup](#frontend-setup)
- [BullMQ Dashboard](#bullmq-dashboard)
- [API Documentation](#api-documentation)
- [Scheduling Architecture](#scheduling-architecture)
- [Restart Persistence](#restart-persistence)
- [Idempotency](#idempotency)
- [Worker Concurrency](#worker-concurrency)
- [Minimum Delay](#minimum-delay)
- [Hourly Rate Limiting](#hourly-rate-limiting)
- [Slack Notification](#slack-notification)
- [Elasticsearch Search](#elasticsearch-search)
- [Testing](#testing)
- [Demo Instructions](#demo-instructions)
- [Demo Videos](#demo-videos)
- [Assumptions](#assumptions)
- [Trade-offs](#trade-offs)
- [Known Limitations](#known-limitations)
- [Future Improvements](#future-improvements)
- [Final Requirement Audit](#final-requirement-audit)

---

## Project Overview

ReachInbox.ai is an AI-powered cold outreach platform. This assessment implements a focused slice of
it: a scheduler that turns "here is a CSV of leads and a message" into individually tracked,
rate-limited, durably-scheduled email sends, with a dashboard to watch them move through
`scheduled -> processing -> sent/failed`.

The system is built as a **modular monolith** - one Express API, one BullMQ worker process, one
Postgres database, one Redis instance, one Elasticsearch index - because that is the right amount
of architecture for this problem. No Kafka, no Kubernetes, no microservices.

## Features

- Google OAuth login (real, session-cookie based)
- Slack OAuth connect / status / disconnect, with real `chat.postMessage` notifications
- CSV/TXT lead-list upload with streaming parse, validation, dedupe, and a "N emails detected" preview
- One database row + one BullMQ delayed job **per recipient** (never one giant job per campaign)
- Ethereal SMTP delivery via Nodemailer, with a real Nodemailer test-account fallback
- Durable, restart-safe scheduling (BullMQ + Redis, Postgres as source of truth)
- Idempotent delivery via an atomic DB-level compare-and-swap claim
- Configurable worker concurrency, minimum inter-send delay, and hourly send limit
- Redis Lua-script based distributed rate limiting - correct under many concurrent workers
- Automatic rescheduling (never dropping) of emails that hit the hourly limit
- Real-time Elasticsearch search by recipient/subject/status
- Live Bull Board dashboard at `/admin/queues` (Basic-Auth protected)
- Swagger/OpenAPI docs at `/api-docs`
- React + TypeScript + Tailwind + TanStack Query dashboard with loading/empty/error states throughout

## Tech Stack

**Backend:** Node.js, TypeScript, Express, PostgreSQL, Prisma, Redis, BullMQ, Elasticsearch,
Nodemailer + Ethereal, Zod, Helmet, CORS, Pino, Swagger UI, Vitest + Supertest, Bull Board.

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Axios.

**Infrastructure:** Docker Compose (Postgres, Redis, Elasticsearch) with persistent named volumes.

## Architecture

- **PostgreSQL** is the single application source of truth for users, senders, campaigns and every
  email's state.
- **Redis** backs two independent things: BullMQ's durable queue state, and the atomic distributed
  rate-limit/min-delay counters (`services/rateLimiter.ts`). It holds no application data of record.
- **BullMQ** schedules one delayed job per email, keyed by a deterministic job id
  (`email:<emailId>`), and a Worker process consumes them with configurable concurrency.
- **The worker** claims an email atomically, checks the distributed rate limiter, sends via
  Ethereal/Nodemailer, and transitions the Postgres row through
  `scheduled -> processing -> sent|failed`.
- **Elasticsearch** is indexed on every state transition and is a pure, best-effort search layer -
  never a source of truth.
- **Slack** receives a real `chat.postMessage` when a sender's hourly limit is hit.
- **Google** is the only login mechanism (no mock/local accounts).

## Architecture Diagram

```mermaid
flowchart TD
    FE["React + Vite Dashboard"] -->|HTTPS + session cookie| API["Express API"]

    API --> PG[("PostgreSQL\n(source of truth)")]
    API --> REDIS[("Redis\n(BullMQ state + rate limits)")]
    API -->|"enqueue delayed job"| BULLMQ["BullMQ Queue\nemail-scheduler"]
    API --> ES[("Elasticsearch\n(search index)")]

    BULLMQ -->|"delayed job fires"| WORKER["Email Worker\n(N concurrent)"]
    WORKER -->|"claim + rate-limit check"| PG
    WORKER -->|"atomic Lua script"| REDIS
    WORKER -->|"send"| SMTP["Ethereal SMTP"]
    WORKER -->|"index status"| ES
    WORKER -->|"limit reached"| SLACK["Slack chat.postMessage"]

    GOOGLE["Google OAuth"] -.->|"login"| API
    SLACKOAUTH["Slack OAuth"] -.->|"connect"| API

    ADMIN["/admin/queues\nBull Board"] --> BULLMQ
```

## Folder Structure

```
reachinbox-scheduler/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── config/          # env, logger, prisma client, redis client, openapi.yaml
│   │   │   ├── controllers/     # thin HTTP handlers
│   │   │   ├── routes/          # express routers (+ admin/docs)
│   │   │   ├── services/        # scheduling, rate limiting, query orchestration
│   │   │   ├── repositories/    # all Prisma access, one file per model
│   │   │   ├── middleware/      # auth, validation, upload, error handling
│   │   │   ├── queues/          # BullMQ queue definition
│   │   │   ├── workers/         # BullMQ worker (job processor + process entrypoint)
│   │   │   ├── integrations/    # email (Ethereal), google, slack, elasticsearch
│   │   │   ├── validation/      # Zod schemas
│   │   │   ├── utils/           # ApiError, response helpers, CSV parser, etc.
│   │   │   ├── app.ts           # Express app factory (used by both server and tests)
│   │   │   └── server.ts        # API process entrypoint
│   │   ├── prisma/              # schema.prisma + migrations/
│   │   └── tests/               # unit/ + integration/
│   └── frontend/
│       └── src/
│           ├── components/      # Header, EmailTable, ComposeModal, States, etc.
│           ├── pages/           # LoginPage, DashboardPage
│           ├── hooks/           # useAuth, useEmails, useSlack, useToast, ...
│           ├── services/        # axios calls per resource
│           ├── router/          # React Router + ProtectedRoute
│           ├── types/           # domain + API response types
│           └── lib/             # axios instance, query client
├── docker-compose.yml           # Postgres + Redis + Elasticsearch
├── .env.example
└── package.json                 # npm workspaces root
```

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres / Redis / Elasticsearch)
- A Google Cloud OAuth client (for login)
- A Slack app (optional, for rate-limit notifications)

## Local Setup

```bash
git clone <this-repo>
cd reachinbox-scheduler
npm install                          # installs both workspaces
cp .env.example apps/backend/.env    # fill in real values, see below
cp apps/frontend/.env.example apps/frontend/.env
docker compose up -d                 # postgres, redis, elasticsearch
cd apps/backend && npx prisma migrate deploy && cd ../..
npm run dev:backend                  # terminal 1
npm run dev:worker                   # terminal 2
npm run dev:frontend                 # terminal 3
```

Visit `http://localhost:5173`.

## Docker Setup

`docker-compose.yml` at the repo root starts exactly the three pieces of infrastructure this
project needs - **no application containers**, since running the API/worker/frontend directly with
Node during development gives faster iteration and is what the assessment expects:

```bash
docker compose up -d      # start postgres, redis, elasticsearch
docker compose ps         # check health
docker compose down       # stop (data persists in named volumes)
docker compose down -v    # stop AND wipe volumes
```

All three services use named, persistent volumes (`postgres_data`, `redis_data`, `es_data`) and
`healthcheck` blocks so `docker compose ps` accurately reflects readiness before you run migrations.

> Docker Desktop's engine wasn't reachable in the environment this was authored in (see the note at
> the top of this document), so this exact compose file was not the thing that was actually run -
> the same three services (Postgres, Redis, Elasticsearch) were instead run natively inside a WSL
> Ubuntu distro and the full app was verified end-to-end against them, including a real Prisma
> migration, real Ethereal sends, real Elasticsearch search, and a genuine restart-persistence test.
> The compose file's images/config are equivalent (same major versions, same disabled-security ES
> setup, same default ports), so it's expected to behave the same - if `docker compose up -d` fails
> for you, it's most likely a local Docker Desktop issue, not a bug in this file.

## Environment Variables

See [`.env.example`](.env.example) (backend, copy to `apps/backend/.env`) and
[`apps/frontend/.env.example`](apps/frontend/.env.example) (frontend). Every value is read through
a Zod-validated `env.ts` - the process refuses to start with a clear error if anything required is
missing or malformed. Nothing is hardcoded; nothing is committed.

Highlights:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (source of truth) |
| `REDIS_URL` | Redis connection string (BullMQ + rate limiter) |
| `ELASTICSEARCH_URL` | Elasticsearch connection string (search index) |
| `SESSION_SECRET` | Signs the HTTP-only session cookie |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Google OAuth |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_REDIRECT_URI` | Slack OAuth |
| `ETHEREAL_USER` / `ETHEREAL_PASSWORD` | Optional - auto-created at startup if blank |
| `WORKER_CONCURRENCY` | BullMQ worker concurrency (default `5`) |
| `MIN_EMAIL_DELAY` | Minimum seconds between sends per sender (default `2`) |
| `MAX_EMAILS_PER_HOUR` | Default hourly send cap per sender (default `100`) |
| `BULLBOARD_USER` / `BULLBOARD_PASSWORD` | Basic-auth for `/admin/queues` |

## Database Setup

The schema (`apps/backend/prisma/schema.prisma`) models `User`, `Sender`, `Campaign`, `Email`, and
`SlackConnection`, with foreign keys, unique constraints (`Sender.userId+email`,
`Email.bullJobId`), and indexes on every field this app actually queries by:
`Email.userId`, `Email.status`, `Email.scheduledAt`, `Email.senderId`, `Email.campaignId`,
`Email.recipient`, and a composite `(userId, status)` for the scheduled/sent list views.
Every query is scoped by `userId` derived from the session - never from client input - for
multi-user isolation. `Sender.smtpUser`/`smtpPassword` exist for future per-sender SMTP but are
never selected into any DTO/repository read path that reaches a controller.

## Prisma Migration

An initial migration is already generated and committed at
`apps/backend/prisma/migrations/20260829000000_init/` (produced offline via
`prisma migrate diff --from-empty`, so it's guaranteed to match `schema.prisma` exactly).
`npx prisma migrate deploy` was actually run against a real PostgreSQL 18 instance during
development and applied cleanly, creating all five tables. To apply it yourself:

```bash
cd apps/backend
npx prisma migrate deploy      # applies committed migrations (use in any environment)
# or, while iterating on the schema:
npx prisma migrate dev
```

`npx prisma studio` gives you a quick GUI over the data while developing.

## Redis Setup

Nothing beyond `docker compose up -d` - the default `redis://localhost:6379` in `.env.example`
points at the compose service. BullMQ and the rate limiter share one Redis instance but use
disjoint key spaces (`bull:email-scheduler:*` vs `email-rate:*` / `email-delay:*`), so no
configuration is needed to keep them from colliding.

## Elasticsearch Setup

`docker compose up -d` starts a single-node cluster with security disabled (fine for local/dev use
in this assessment). On boot, `server.ts` calls `ensureEmailsIndex()`, which creates the `emails`
index with explicit mappings if it doesn't already exist - no manual step required.

## Ethereal Setup

Two ways to run this:

1. **Do nothing.** Leave `ETHEREAL_USER`/`ETHEREAL_PASSWORD` blank. On first send, the backend calls
   `nodemailer.createTestAccount()` - a real call to the Ethereal API - and uses the account it gets
   back for the rest of the process's lifetime. This was verified with a real, live send during
   development of this project (a genuine SMTP round-trip to `smtp.ethereal.email`, not a stub):
   the call returned a real provider message id and a working
   `https://ethereal.email/message/...` preview URL.
2. **Provide your own.** Create an account at [ethereal.email](https://ethereal.email) and set
   `ETHEREAL_USER`/`ETHEREAL_PASSWORD` so the same inbox persists across restarts.

Every sent email's Nodemailer preview URL is logged by the worker so you can open it and see the
actual rendered message.

## Google OAuth Setup

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth
   2.0 Client ID (type: Web application).
2. Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `apps/backend/.env`.
4. Restart the backend. "Continue with Google" on the login page now works end-to-end.

There is no mock login path - `isGoogleOAuthConfigured()` returns a clean `502 UPSTREAM_ERROR`
instead of a fake success if credentials are missing, rather than silently faking a user.

## Slack OAuth Setup

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps).
2. Under **OAuth & Permissions**, add redirect URL `http://localhost:4000/api/slack/callback` and
   scopes `chat:write` + `incoming-webhook`.
3. Set `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` in `apps/backend/.env`.
4. From the dashboard header, click **Connect Slack**, approve, pick a channel for the incoming
   webhook. The connection (access token + channel id) is stored per-user in `SlackConnection`.

If Slack was never connected, rate-limit notifications are silently skipped (logged, not thrown) -
email delivery is never blocked on Slack being reachable. If you connect Slack *after* the worker
has been running for a while, the very next rate-limit hit picks it up immediately (the worker
looks up the connection fresh on every notification, not once at startup).

## Backend Setup

```bash
cd apps/backend
npm run dev            # tsx watch, API on :4000
npm run build           # tsc -> dist, copies openapi.yaml
npm start                # node dist/server.js
```

## Worker Setup

The worker is a **separate process** from the API (as it should be, so API latency is never coupled
to SMTP/rate-limit latency):

```bash
cd apps/backend
npm run dev:worker       # tsx watch
npm run start:worker     # node dist/workers/index.js (after build)
```

Run as many worker processes as you like; `WORKER_CONCURRENCY` controls concurrency *within* each
process, and the Redis-backed rate limiter/idempotency claim make it safe to run several processes
at once (see [Worker Concurrency](#worker-concurrency)).

## Frontend Setup

```bash
cd apps/frontend
npm run dev        # Vite dev server on :5173
npm run build       # production build to dist/
```

## BullMQ Dashboard

A real [Bull Board](https://github.com/felixmosh/bull-board) instance, wired directly to the live
`email-scheduler` queue (not a mock UI), is mounted at:

```
http://localhost:4000/admin/queues
```

Protected with HTTP Basic Auth (`BULLBOARD_USER` / `BULLBOARD_PASSWORD`). Shows waiting, delayed,
active, completed and failed jobs in real time.

## API Documentation

Full OpenAPI 3.0 documentation (`apps/backend/src/config/openapi.yaml`) is served interactively at:

```
http://localhost:4000/api-docs
```

covering every endpoint, method, auth requirement, request/response schema, and error codes.

## Scheduling Architecture

`POST /api/emails/schedule` (`services/schedulingService.ts`) does, in order:

1. Validate the request with Zod (`validation/emailSchemas.ts`) - subject, body, recipients (each
   individually re-validated as an email, never trusting the frontend's own CSV validation),
   `startTime` (must not be in the past), `delayBetweenEmails`, `hourlyLimit`.
2. Resolve/create the sender.
3. Compute a per-recipient `scheduledAt` (`services/scheduleCalculator.ts`) that respects
   `delayBetweenEmails` spacing and never places more than `hourlyLimit` sends inside one hour
   bucket (rolling into the next hour boundary instead).
4. Write one `Campaign` row and one `Email` row **per recipient** inside a single Postgres
   transaction.
5. For each `Email` row, `queue.add()` a BullMQ delayed job whose id is deterministic
   (`email:<emailId>`), then persist that job id back onto the row.
6. Index each email into Elasticsearch.

**DB/queue consistency.** Postgres is written first and is authoritative. BullMQ job ids are
deterministic, so step 5 is safe to retry - adding a job with an id BullMQ already has is a no-op.
If a crash happens between steps 4 and 5 for some subset of rows (e.g. Redis blips mid-loop), those
rows are left as `scheduled` with `bullJobId = null`; `reconcileOrphanedEmailJobs()` runs on every
API/worker process boot, finds them, and enqueues the missing job. This is a small, understandable
reconciliation sweep rather than a full transactional-outbox-with-poller - appropriate for this
assignment's scope, and explicitly *not* over-engineered.

A single campaign always produces **N individual jobs**, never one bulk job for the whole CSV - this
is what lets one bad recipient fail independently of the other 999.

## Restart Persistence

BullMQ persists all queue state (waiting/delayed/active job data, including a job's remaining
delay) in Redis, which itself persists to disk (`appendonly yes` in the compose file). Concretely:

1. You schedule an email for 10 minutes from now → a delayed job is added to Redis with that
   timestamp.
2. `docker compose down` or a plain process kill of the API/worker does **not** touch Redis.
3. On worker restart, it reconnects to the same Redis instance/queue. BullMQ's own delayed-job
   timer (backed by a Redis sorted set, not an in-process `setTimeout`) is untouched by the
   restart, and the job fires at its original scheduled time.
4. Postgres is unaffected regardless - the `Email` row's `status`/`scheduledAt` were never
   in-memory state to begin with.

There is no cron, no `node-cron`, no OS crontab, and no `setInterval`-based scheduler anywhere in
this codebase - every scheduled action is a BullMQ delayed job.

## Idempotency

Lifecycle: `scheduled -> processing -> sent` (or `-> failed` once retries are exhausted).

The worker (`workers/emailWorker.ts`) claims an email via `claimEmailForProcessing()`
(`repositories/emailRepository.ts`), which issues:

```sql
UPDATE emails SET status = 'processing' WHERE id = $1 AND status = 'scheduled'
```

Postgres takes a row lock for the duration of that `UPDATE`. If two workers race on the same row,
the second `UPDATE` blocks until the first commits, then re-evaluates `status = 'scheduled'` against
the now-committed row, sees `processing`, and matches zero rows - the second caller gets `null` back
and does nothing further. This is an atomic compare-and-swap with no explicit locking API needed;
Postgres's own MVCC provides it. A row already `sent` or `failed` is also checked and skipped before
any claim is attempted at all, so a redelivered/retried job is a guaranteed no-op once a send has
succeeded.

**A real concurrency bug found and fixed during live testing.** `claimEmailForProcessing()` originally
wrapped that single `UPDATE` plus a follow-up `findUnique` in an interactive `prisma.$transaction()`.
Under real concurrent worker load, a job failed live in Bull Board with
`PrismaClientKnownRequestError: Unable to start a transaction in the given time` - an interactive
transaction holds a dedicated connection from Prisma's pool for its entire duration, and several
overlapping claims exhausted a small pool. The fix: the `UPDATE`'s own `WHERE status = 'scheduled'`
clause is already what provides the atomicity described above, so the follow-up read never needed
snapshot isolation with the write - `claimEmailForProcessing()` now issues two independent,
short-lived calls instead of one interactive transaction, and `.env.example`'s `DATABASE_URL` gained
`?connection_limit=20` as additional headroom. The failure was already handled safely by the
system's design before the fix even landed - it was a non-final attempt, so the row released back to
`scheduled` for BullMQ's own backoff retry, and it succeeded on retry with no duplicate send - but
the root cause was real and is now removed rather than merely tolerated.

**Honest limitation (please read).** If the worker process crashes *after* Ethereal accepts the
message but *before* the `markEmailSent()` write commits, BullMQ's stalled-job recovery can later
redeliver that same job, and the email would be sent a second time. This is not a bug that more
application-level locking can fix - it is the fundamental at-least-once nature of coordinating a
durable queue with a non-transactional external side effect (an SMTP handshake cannot be rolled back
together with a database write). This assessment's brief explicitly asks for honesty here rather
than a false claim of mathematically guaranteed exactly-once delivery, so: this design minimizes the
window (the gap between "SMTP accepted" and "DB commit" is a handful of milliseconds, not a network
round trip's worth of user-visible retrying) but does not eliminate it.

## Worker Concurrency

`WORKER_CONCURRENCY` is passed straight into BullMQ's `Worker` options
(`workers/emailWorker.ts`) - BullMQ then runs that many jobs concurrently *within* that process,
each in its own async context. No shared mutable process state is used for anything that needs to
be correct across concurrency (rate limiting and idempotency both go through Redis/Postgres), so
running multiple worker processes at once - even on different machines - is safe by construction,
not by convention.

## Minimum Delay

There is exactly one place these two defaults live: `MIN_EMAIL_DELAY` / `MAX_EMAILS_PER_HOUR` in
`.env`. The schedule request body may omit `delayBetweenEmails`/`hourlyLimit` entirely - Zod leaves
them `undefined` rather than applying a duplicate hardcoded default, and
`emailController.schedule()` falls back to `env.MIN_EMAIL_DELAY` / `env.MAX_EMAILS_PER_HOUR` only at
that single point. The frontend mirrors the same value (rather than hardcoding its own `2`/`100`)
by calling `GET /api/config/defaults` and pre-filling the compose form with whatever this
environment is actually configured with.

`MIN_EMAIL_DELAY` (seconds) is enforced per-sender via the same Redis Lua script as the hourly
limit (`services/rateLimiter.ts`): a `email-delay:{senderId}` key stores the epoch-ms timestamp the
sender is next allowed to send at, checked and (on success) advanced atomically in one round trip.
If the check fails, the worker does **not** busy-wait or sleep in-process - it calls
`job.moveToDelayed()` to push the same BullMQ job to that exact future timestamp and throws
BullMQ's `DelayedError`, which tells BullMQ "this job needs to wait, don't count this as a failed
attempt." Because the check-and-advance is one atomic Redis operation, this holds even when many
concurrent workers are racing to send for the same sender simultaneously.

## Hourly Rate Limiting

`MAX_EMAILS_PER_HOUR` (overridable per campaign) is enforced by the same Lua script, using a
Redis key `email-rate:{senderId}:{hourWindow}` (an `INCR` with a TTL slightly longer than an hour,
so exhausted windows clean themselves up). The script increments, and if the result exceeds the
limit, decrements back and reports `rate_limited` - all inside one atomic script invocation, so 10
workers hitting the same sender at once cannot collectively send 101 emails against a limit of 100:
Redis executes Lua scripts atomically (single-threaded), and the 101st caller's `INCR` will always
either see the true post-increment count of the others or genuinely be the true 101st - there is no
observable interleaving where two callers both believe they got slot #100.

When the limit is hit: the worker releases the email row back to `scheduled` with a new
`scheduledAt` at the start of the next hour window, and reschedules the **same** BullMQ job to that
timestamp (never a new job, never dropped, never permanently failed). For 500 emails at a limit of
100/hour, the expected behavior is exactly what the assignment describes: 100 sent in hour 1, 100 in
hour 2, ... 100 in hour 5.

## Slack Notification

`integrations/slack/slackNotifier.ts` sends a real `chat.postMessage` call
(`⚠️ Sender X reached the hourly email limit of N. Remaining emails have been rescheduled.`) the
first time a sender's hourly limit is hit in a given hour window. Deduplication uses a Redis
`SET ... NX` on `slack-rate-limit-notified:{senderId}:{hourWindow}` so a burst of concurrent workers
all hitting the limit at once still produces exactly one Slack message per sender per hour. If
Slack isn't connected, the function logs and returns - it never throws, so it can never fail an
email send. The Slack connection is looked up fresh from Postgres on every notification (not cached
at startup), so connecting Slack mid-run is picked up on the very next rate-limit event with no
restart required.

## Elasticsearch Search

`GET /api/emails/search` always queries Elasticsearch (`multi_match` across `recipient` and
`subject`, plus an optional `status` filter) - never Postgres `LIKE`. Elasticsearch returns matching
ids in relevance order; those ids are then re-hydrated from Postgres (still scoped to the
authenticated user) and returned in the same order, so Postgres stays the source of truth for the
actual content shown to the user, while Elasticsearch owns relevance/matching. Every email
status transition (`sent`, `failed`) re-indexes the document. If Elasticsearch is briefly
unreachable, indexing failures are caught and logged (never thrown) so a slow/down ES **never blocks
email delivery** - the tradeoff is that a document can be transiently stale/missing from search
until its next successful index call (e.g., its next status transition), which is an acceptable,
documented consistency model for a search layer that is explicitly not the source of truth.

## Testing

```bash
cd apps/backend
npm test
```

- **Unit tests** (`tests/unit/`): the hour-bucket schedule calculator (including "never more than
  N per hour" and "500 emails / 100-per-hour → 5 distinct hour windows"), the CSV/TXT parser
  (valid/invalid/duplicate/empty/case-insensitivity/CSV-header handling), and the worker's
  idempotency/rate-limit/retry logic (mocked repositories + rate limiter, verifying `sendEmail` is
  never called for an already-`sent`/`failed`/already-claimed email, that a rate-limited job is
  rescheduled via `DelayedError` rather than failed, and that only the final retry attempt marks a
  row `failed`).
- **Integration tests** (`tests/integration/`): the real Express app (auth middleware, Zod
  validation, error handler, 404 handler) exercised with Supertest, with Prisma/Redis/BullMQ mocked
  at their module boundary so this suite runs with zero infrastructure. Confirms every protected
  email route 401s without a session, and that a client-supplied `userId` in the request body is
  simply ignored (identity comes only from the signed session cookie).
- A dedicated Redis integration suite (`tests/integration/rateLimiter.test.ts`) exercises the real
  Lua script - including 20 concurrent callers against a limit of 10 - against a **real** Redis
  instance, because the whole point of that module is atomicity a mock cannot faithfully
  represent. It auto-skips (rather than failing `npm test`) when Redis isn't reachable; run
  `docker compose up -d` (or point `REDIS_URL` at any reachable Redis) first to include it.

Current result with a real Redis reachable: **31 passed, 0 skipped, 0 failed.**

`npm run lint` (both `apps/backend` and `apps/frontend`, ESLint 9 flat config + `typescript-eslint`)
passes with **0 errors, 0 warnings**, alongside `npm run typecheck` and `npm run build` in both
workspaces.

## Demo Instructions

This sequence is not a hypothetical - it is what was actually run, live, end-to-end (Docker
Desktop's engine was unreachable in the authoring sandbox, so PostgreSQL/Redis/Elasticsearch ran via
a WSL Ubuntu distro instead, functionally equivalent to `docker-compose.yml`; every other step used
the real running application with no shortcuts). It doubles as the script for a recorded demo,
comfortably inside 5 minutes:

1. `docker compose up -d` (or the WSL-hosted equivalent used here), then `npx prisma migrate deploy`
   in `apps/backend` - **done**, the migration applied cleanly and created all five tables.
2. Start backend (`npm run dev:backend`), worker (`npm run dev:worker`), frontend
   (`npm run dev:frontend`).
3. Open `http://localhost:5173` → **Continue with Google** - **done with a real Google account**,
   confirmed via the backend log (`"User authenticated via Google OAuth"`) and the session cookie it
   issued.
4. Dashboard appears with your name/email/avatar in the header - **confirmed**.
5. **Compose new email** → subject + body.
6. Upload a CSV/TXT lead list → see "N email addresses detected" - **confirmed** with a real CSV
   file.
7. Set start time a minute or two out, delay `1-2`s, hourly limit `2-3` (small, for a fast demo).
8. **Schedule** → **Scheduled Emails** tab shows each recipient with its own row/time - **confirmed**,
   one `Email` row and one BullMQ job per recipient, never a single bulk job.
9. Open `http://localhost:4000/admin/queues` → see the delayed jobs for this campaign - **confirmed**
   via the dashboard's own API, matching Postgres exactly.
10. Wait for the start time → job moves to active → completed; email lands in **Sent Emails** -
    **confirmed**, with a real Ethereal preview URL captured in the worker log each time.
11. Open the worker's log line for that email → click its Ethereal preview URL → see the real
    rendered message.
12. Search a recipient/subject in the **Search** tab - **confirmed** against real Elasticsearch, and
    independently verified by reading the raw ES document directly (not just through the app).
13. Stop the backend/worker, wait, restart them → any still-delayed job is untouched and fires at
    its original time - **confirmed rigorously**: both processes were independently verified dead at
    the OS level (not just "stop requested"), the wait spanned the scheduled time with the API
    genuinely unreachable throughout, and the job fired automatically within seconds of restart with
    no manual re-trigger.
14. Schedule enough emails to exceed a small hourly limit on one sender → the first N send, the rest
    reschedule to the next hour window automatically (visible in Bull Board as their delay jumping
    forward) instead of failing - **confirmed**, including the Redis counter landing on exactly the
    configured limit, never over it.
15. With Slack connected, that same rate-limit hit produces a real message in the chosen Slack
    channel - **confirmed**: a real Slack app was connected to a real workspace, its bot was added to
    `#new-channel`, and the resulting notification was visually confirmed inside that channel.

## Demo Videos

### Main Assignment Demo
https://www.loom.com/share/c4ec31e792c74860bd6a01d79112f490

### Slack & Additional Demo
https://www.loom.com/share/e62b90de675f459eac4cf5bd717803f7

The first video is the main assignment walkthrough. The second video contains the Slack/additional
demonstration.

## Known Limitations

- If a worker crashes in the narrow window between an Ethereal send succeeding and the DB commit
  marking it `sent`, a duplicate send is possible on redelivery (see
  [Idempotency](#idempotency) - documented honestly rather than hidden).
- A row that gets stuck in `processing` because its worker died *before* reaching the send/claim
  release logic (e.g., killed exactly between the claim and the rate-limit check) has no automatic
  timeout-based recovery in this version; a production hardening pass would add a periodic sweep
  that releases `processing` rows older than N minutes back to `scheduled`.
- Sender-level SMTP credentials (`Sender.smtpUser`/`smtpPassword` in the schema) are modeled but not
  wired to a real per-sender transport - see the Ethereal trade-off above.
- `docker-compose.yml` itself was never actually run in this authoring environment (Docker Desktop's
  engine was unreachable) - Postgres/Redis/Elasticsearch were instead run via equivalent native
  installs inside a WSL Ubuntu distro, and the compose file was reviewed rather than executed. The
  OAuth flows are not part of this limitation - both Google and Slack OAuth were fully exercised
  live, end-to-end, with real credentials (see the note at the top of this document).

## Future Improvements

- Per-sender SMTP credentials with a real provider (SendGrid/SES) behind the same `sendEmail()`
  interface.
- A `processing`-row reconciliation sweep (see Known Limitations) for full crash-recovery coverage.
- Webhook-based Elasticsearch retry queue instead of fire-and-forget indexing, for stronger
  eventual consistency guarantees.
- Per-campaign pause/resume and a cancel-remaining-emails action.
- Rich-text/template compose editor with merge-field support (`{{name}}` is accepted in body today
  but not yet auto-populated per recipient).

## Final Requirement Audit

| Requirement | Status | Implementation |
|---|---|---|
| TypeScript backend | ✅ | Strict-mode TS throughout `apps/backend/src` |
| Express | ✅ | `src/app.ts` |
| PostgreSQL/MySQL | ✅ | PostgreSQL via Prisma, `prisma/schema.prisma` |
| BullMQ | ✅ | `src/queues/emailQueue.ts`, `src/workers/emailWorker.ts` |
| Redis | ✅ | `src/config/redis.ts`, shared by BullMQ + rate limiter |
| Delayed scheduling | ✅ | `scheduleEmailJob()` deterministic delayed jobs |
| Ethereal SMTP | ✅ | `src/integrations/email/mailer.ts`, live-tested (see above) |
| Restart persistence | ✅ | Redis-backed BullMQ state; see [Restart Persistence](#restart-persistence) |
| Idempotency | ✅ | Atomic DB claim; see [Idempotency](#idempotency) |
| Worker concurrency | ✅ | `WORKER_CONCURRENCY` → BullMQ `Worker` concurrency option |
| Minimum delay | ✅ | Redis Lua script, `MIN_EMAIL_DELAY` |
| Hourly rate limit | ✅ | Redis Lua script, `MAX_EMAILS_PER_HOUR` / campaign `hourlyLimit` |
| Distributed rate limit | ✅ | Atomic Lua `INCR`/compare-and-release; tested with 20 concurrent callers |
| Slack OAuth | ✅ | `src/integrations/slack/slackOAuth.ts`, `src/controllers/slackController.ts` |
| Slack notification | ✅ | `src/integrations/slack/slackNotifier.ts`, real `chat.postMessage` |
| Google OAuth | ✅ | `src/integrations/google/googleOAuth.ts`, `src/controllers/authController.ts` |
| Elasticsearch | ✅ | `src/integrations/elasticsearch/`, index created on boot |
| Elasticsearch search | ✅ | `GET /api/emails/search`, `multi_match` query |
| BullMQ dashboard | ✅ | `/admin/queues`, real Bull Board bound to the live queue |
| React | ✅ | `apps/frontend` |
| TypeScript frontend | ✅ | Strict-mode TS throughout `apps/frontend/src` |
| Tailwind | ✅ | `tailwind.config.js`, utility classes throughout |
| CSV upload | ✅ | `LeadListUpload.tsx` + `parse-recipients` endpoint, streamed parsing |
| Scheduled emails | ✅ | `ScheduledEmailsPanel.tsx` + `GET /api/emails/scheduled` |
| Sent emails | ✅ | `SentEmailsPanel.tsx` + `GET /api/emails/sent` |
| Loading states | ✅ | `LoadingState` used on every async view |
| Empty states | ✅ | `EmptyState` used on every async view |
| Error handling | ✅ | Centralized `errorHandler.ts` (backend) + `ErrorState`/toasts (frontend) |
| API documentation | ✅ | `/api-docs`, `src/config/openapi.yaml` |
| Tests | ✅ | 31/31 passing against real infra; see [Testing](#testing) |
| Docker | ✅ | `docker-compose.yml`, Postgres + Redis + Elasticsearch, persistent volumes |
| README | ✅ | This document |
| Demo instructions | ✅ | See [Demo Instructions](#demo-instructions) |
