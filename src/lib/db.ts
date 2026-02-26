import "server-only";

import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import path from "node:path";
import postgres, { type Sql } from "postgres";

import type {
  AuditAction,
  AuditLog,
  TimerSegment,
  StorageInfo,
  TimeEntry,
  TrackerDb
} from "@/types/time-tracker";

const DATA_DIR = path.join(process.cwd(), "data");
const RUNTIME_DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "contractor-time-tracker-data")
  : DATA_DIR;
const SEED_PATH = path.join(DATA_DIR, "db.json");
const LOCAL_PATH = path.join(RUNTIME_DATA_DIR, "db.local.json");
const DB_ROW_ID = "singleton";
const POSTGRES_URL =
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL ??
  null;

let writeQueue: Promise<void> = Promise.resolve();
let pgClient: Sql | null = null;
let pgInitPromise: Promise<void> | null = null;

function normalizeSegments(entry: { startedAtUtc?: string; segments?: TimerSegment[]; status?: string }): TimerSegment[] {
  if (Array.isArray(entry.segments) && entry.segments.length > 0) {
    return entry.segments
      .filter((segment) => segment && typeof segment.startAtUtc === "string")
      .map((segment) => ({
        startAtUtc: segment.startAtUtc,
        endAtUtc: typeof segment.endAtUtc === "string" ? segment.endAtUtc : undefined
      }));
  }
  if (entry.startedAtUtc) {
    return [{ startAtUtc: entry.startedAtUtc }];
  }
  return [];
}

function normalizeDb(db: TrackerDb): TrackerDb {
  db.appSettings = db.appSettings ?? ({ defaultContractorUserId: "" } as TrackerDb["appSettings"]);
  if (!db.appSettings.billingTimezone) {
    db.appSettings.billingTimezone = "America/New_York";
  }

  db.activeTimers = (db.activeTimers ?? []).map((timer) => {
    const segments = normalizeSegments(timer);
    const openSegment = [...segments].reverse().find((segment) => !segment.endAtUtc);
    return {
      ...timer,
      status: timer.status === "paused" ? "paused" : "running",
      pausedAtUtc: timer.pausedAtUtc ?? null,
      segments: segments.length > 0 ? segments : timer.startedAtUtc ? [{ startAtUtc: timer.startedAtUtc }] : [],
      startedAtUtc: timer.startedAtUtc ?? (segments[0]?.startAtUtc ?? nowUtcIso()),
      source: timer.source ?? "web",
      startedByUserId: timer.startedByUserId ?? timer.userId,
      ...(openSegment ? {} : timer.status === "paused" ? {} : { status: "paused" as const })
    };
  });

  db.timeEntries = (db.timeEntries ?? []).map((entry) => {
    const expectedAmount = Math.round(((entry.durationMinutes / 60) * entry.rateSnapshot + Number.EPSILON) * 100) / 100;
    const amountOverridden = entry.amountOverridden ?? Math.abs((entry.amount ?? 0) - expectedAmount) > 0.009;
    return {
      ...entry,
      segments:
        Array.isArray(entry.segments) && entry.segments.length > 0
          ? entry.segments
          : [{ startAtUtc: entry.startAtUtc, endAtUtc: entry.endAtUtc }],
      approvedForPayout: entry.approvedForPayout ?? true,
      amountOverridden,
      notes: entry.notes ?? "",
      edited: Boolean(entry.edited)
    };
  });

  db.auditLogs = db.auditLogs ?? [];
  db.contracts = db.contracts ?? [];
  db.users = db.users ?? [];
  return db;
}

function hasPostgresStorage() {
  return Boolean(POSTGRES_URL);
}

function getPgClient() {
  if (!POSTGRES_URL) {
    throw new Error("Postgres storage is not configured");
  }
  if (!pgClient) {
    pgClient = postgres(POSTGRES_URL, {
      max: 1,
      prepare: false,
      idle_timeout: 10
    });
  }
  return pgClient;
}

async function ensurePostgresStateStore() {
  if (!hasPostgresStorage()) return;
  if (!pgInitPromise) {
    pgInitPromise = (async () => {
      const sql = getPgClient();
      await sql`
        create table if not exists hamzatrack_state (
          id text primary key,
          state jsonb not null,
          updated_at timestamptz not null default now()
        )
      `;

      const existing = await sql<{ id: string }[]>`
        select id from hamzatrack_state where id = ${DB_ROW_ID} limit 1
      `;
      if (existing.length === 0) {
        const seedRaw = await readFile(SEED_PATH, "utf-8");
        await sql`
          insert into hamzatrack_state (id, state, updated_at)
          values (${DB_ROW_ID}, ${seedRaw}::jsonb, now())
        `;
      }
    })();
  }
  await pgInitPromise;
}

async function ensureLocalDb() {
  await mkdir(RUNTIME_DATA_DIR, { recursive: true });

  try {
    await access(LOCAL_PATH);
  } catch {
    await copyFile(SEED_PATH, LOCAL_PATH);
  }
}

export async function readDb(): Promise<TrackerDb> {
  if (hasPostgresStorage()) {
    await ensurePostgresStateStore();
    const sql = getPgClient();
    const rows = await sql<{ state: TrackerDb }[]>`
      select state
      from hamzatrack_state
      where id = ${DB_ROW_ID}
      limit 1
    `;
    if (!rows[0]) {
      throw new Error("Durable state row not found");
    }
    return normalizeDb(rows[0].state);
  }

  await ensureLocalDb();
  const raw = await readFile(LOCAL_PATH, "utf-8");
  return normalizeDb(JSON.parse(raw) as TrackerDb);
}

async function writeDb(db: TrackerDb) {
  await ensureLocalDb();
  await writeFile(LOCAL_PATH, JSON.stringify(db, null, 2));
}

export async function updateDb<T>(updater: (db: TrackerDb) => Promise<T> | T): Promise<T> {
  let resolveOuter!: (value: T) => void;
  let rejectOuter!: (reason?: unknown) => void;

  const resultPromise = new Promise<T>((resolve, reject) => {
    resolveOuter = resolve;
    rejectOuter = reject;
  });

  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    try {
      let result!: T;
      if (hasPostgresStorage()) {
        await ensurePostgresStateStore();
        const sql = getPgClient();
        result = (await sql.begin(async (tx) => {
          const query = tx as unknown as Sql;
          const rows = await query<{ state: TrackerDb }[]>`
            select state
            from hamzatrack_state
            where id = ${DB_ROW_ID}
            for update
          `;
          if (!rows[0]) {
            throw new Error("Durable state row not found");
          }
          const db = rows[0].state;
          const txResult = await updater(db);
          const stateJson = JSON.stringify(db);
          await query`
            update hamzatrack_state
            set state = ${stateJson}::jsonb,
                updated_at = now()
            where id = ${DB_ROW_ID}
          `;
          return txResult;
        })) as T;
      } else {
        const db = await readDb();
        result = await updater(db);
        await writeDb(db);
      }
      resolveOuter(result);
    } catch (error) {
      rejectOuter(error);
    }
  });

  return resultPromise;
}

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function nowUtcIso() {
  return new Date().toISOString();
}

export function sortEntriesDesc(entries: TimeEntry[]) {
  return [...entries].sort((a, b) => b.startAtUtc.localeCompare(a.startAtUtc));
}

export function appendAuditLog(
  db: TrackerDb,
  audit: {
    actorId: string;
    action: AuditAction;
    targetType: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    timestampUtc?: string;
  }
) {
  const record: AuditLog = {
    id: createId("audit"),
    actorId: audit.actorId,
    action: audit.action,
    targetType: audit.targetType,
    targetId: audit.targetId,
    timestampUtc: audit.timestampUtc ?? nowUtcIso(),
    metadata: audit.metadata ?? {}
  };
  db.auditLogs.push(record);
  return record;
}

export function getStorageInfo(): StorageInfo {
  if (hasPostgresStorage()) {
    return {
      mode: "postgres-json",
      durable: true
    };
  }
  return {
    mode: "json-file",
    durable: false,
    note: process.env.VERCEL
      ? "Ephemeral /tmp storage on Vercel. Connect Postgres (DATABASE_URL or POSTGRES_URL) to prevent data loss."
      : "Local JSON file storage (good for local dev only)."
  };
}
