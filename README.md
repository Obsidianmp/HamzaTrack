# HamzaTrack (MVP)

A simple start/stop time tracker for one overseas contractor and one admin, focused on accurate monthly totals and billable amounts.

## What it includes

- Demo login with 2 seeded users (`Admin`, `Contractor`)
- Contractor timer page with Start / Pause / Resume / Log Work Session
- Admin dashboard with:
  - Daily / Weekly / Monthly / MTD / YTD views
  - Billing timezone (New York) vs display timezone toggle
  - Total hours / minutes / billable / session count
  - Avg / Day (MTD)
  - Time log table
  - Inline entry editing (contractor + admin; admin-only amount edits)
  - CSV + PDF summary export
  - Backup / export all data (JSON)
  - Audit log (timer events + edits + approvals + settings)
  - Monthly trend (last 6 months)
- Monthly payout summary screen (approved hours, overrides, total due)
- Settings page for hourly rate, currency, and timezones
- Shared server-side datastore (JSON locally, Postgres when `DATABASE_URL` is set)

## Storage modes

This repo runs in two modes:

- `json-file` (default local/demo mode)
- `postgres-json` (durable mode, enabled automatically when `DATABASE_URL` or `POSTGRES_URL` is set)

The Postgres mode works well with Supabase because Supabase gives you a standard Postgres connection string.

A Supabase migration starter (relational schema, optional future upgrade) is included at:

- `/Users/ericwex/Desktop/CLAUDE/contractor-time-tracker/supabase/migrations/0001_init.sql`

## Quick start

1. Install dependencies

```bash
npm install
```

2. Start the app

```bash
npm run dev
```

3. Open:

- [http://localhost:3000](http://localhost:3000)

## Demo accounts

- `Admin` (`admin@example.com`)
- `Contractor` (`contractor@example.com`)

Login is a seeded role selector for MVP/demo use.
Admin login requires a password (`Obsidian1030!`) unless overridden with `ADMIN_LOGIN_PASSWORD`.

## Data storage

- Seed template: `data/db.json`
- Runtime writable DB: `data/db.local.json` (auto-created on first run)

To reset runtime data, delete `data/db.local.json` or copy from the seed file again.

## Supabase / Production cutover (recommended)

1. Create a Supabase project (free tier is fine to start).
2. Copy the Supabase Postgres connection string.
3. In Vercel project settings, add one of:
   - `DATABASE_URL` (recommended)
   - or `POSTGRES_URL`
4. Redeploy Vercel.
5. Confirm the in-app storage warning banner disappears.

Notes:
- The app stores timestamps in UTC and uses a fixed billing timezone of `America/New_York` for payout calculations.
- User timezone changes only affect display/reporting in `Display TZ` mode and do not rewrite stored timestamps.
- On Vercel without Postgres, fallback `/tmp` storage is ephemeral and can lose data.

## Business rules implemented

- Time stored in UTC
- Billing timezone is fixed to New York (`America/New_York`)
- Display/reporting can switch between billing timezone and user display timezone
- Billing uses exact minutes (`minutes / 60 * hourly rate`)
- Rate snapshot stored on each entry (historical billing remains stable)
- Contractor edits require an edit reason when changing time
- Contractor edits are marked and default to not approved for payout until admin review
- Overlapping entries prevented
- One active timer per contractor
- Timer supports pause/resume and logs a session only when finalized
- Weeks index from Monday
- Range totals are overlap-aware (crossing boundaries still reports correctly)

## Suggested next upgrades

1. Replace demo login with Supabase Auth
2. Move from single-row Postgres JSON storage to relational tables (optional scaling step)
3. Add multi-contractor/project support
4. Add invoice approval workflow + payout PDF layout polish
5. Add tests for timezone boundary math and paused-session segment handling
