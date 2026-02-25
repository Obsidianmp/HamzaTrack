# Contractor Time Tracker (MVP)

A simple start/stop time tracker for one overseas contractor and one admin, focused on accurate monthly totals and billable amounts.

## What it includes

- Demo login with 2 seeded users (`admin`, `contractor`)
- Contractor Start/Stop timer page
- Admin dashboard with:
  - Daily / Weekly / Monthly / MTD / YTD views
  - Total hours / minutes / billable / session count
  - Time log table
  - Inline entry editing (admin only)
  - CSV export (current filtered table)
  - Audit log (timer start/stop + edits + settings)
  - Monthly trend (last 6 months)
- Settings page for hourly rate, currency, and timezones
- Shared server-side JSON datastore (so both users see the same records)

## Why JSON instead of Supabase (for this repo)

This repo is built to run immediately without external services. It uses a file-backed datastore (`data/db.local.json`) and is structured so you can swap the persistence layer later.

A Supabase migration starter is included at:

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
- `Overseas Contractor` (`contractor@example.com`)

Login is a seeded role selector (no password) for MVP/demo use.

## Data storage

- Seed template: `data/db.json`
- Runtime writable DB: `data/db.local.json` (auto-created on first run)

To reset runtime data, delete `data/db.local.json` or copy from the seed file again.

## Business rules implemented

- Time stored in UTC
- Display formatted in the configured user/contractor timezone
- Billing uses exact minutes (`minutes / 60 * hourly rate`)
- Rate snapshot stored on each entry (historical billing remains stable)
- Overlapping entries prevented
- One active timer per contractor
- Range totals are overlap-aware (crossing boundaries still reports correctly)

## Suggested next upgrades

1. Replace demo login with Supabase Auth
2. Swap JSON datastore for Postgres/Supabase
3. Add multi-contractor/project support
4. Add server-side CSV export endpoint + invoice generation
5. Add tests for timezone boundary math and timer overlap rules
