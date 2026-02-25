create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin', 'contractor')),
  timezone text not null default 'UTC'
);

create table if not exists contracts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  hourly_rate numeric(12,2) not null check (hourly_rate >= 0),
  currency text not null default 'USD',
  active_from_utc timestamptz not null default now()
);

create unique index if not exists contracts_one_active_per_user on contracts(user_id);

create table if not exists app_settings (
  id smallint primary key default 1,
  default_contractor_user_id text not null references users(id)
);

create table if not exists active_timers (
  user_id text primary key references users(id) on delete cascade,
  started_at_utc timestamptz not null,
  started_by_user_id text not null references users(id),
  source text not null default 'web'
);

create table if not exists time_entries (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  start_at_utc timestamptz not null,
  end_at_utc timestamptz not null,
  duration_minutes integer not null check (duration_minutes >= 0),
  rate_snapshot numeric(12,2) not null check (rate_snapshot >= 0),
  currency text not null,
  amount numeric(12,2) not null check (amount >= 0),
  notes text,
  source text not null default 'timer',
  edited boolean not null default false,
  created_at_utc timestamptz not null default now(),
  updated_at_utc timestamptz not null default now(),
  check (end_at_utc > start_at_utc)
);

create index if not exists time_entries_user_start_idx on time_entries(user_id, start_at_utc desc);
create index if not exists time_entries_user_end_idx on time_entries(user_id, end_at_utc desc);

create table if not exists audit_logs (
  id text primary key,
  actor_id text not null references users(id),
  action text not null,
  target_type text not null,
  target_id text,
  timestamp_utc timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_logs_actor_idx on audit_logs(actor_id, timestamp_utc desc);
create index if not exists audit_logs_target_idx on audit_logs(target_type, target_id, timestamp_utc desc);
