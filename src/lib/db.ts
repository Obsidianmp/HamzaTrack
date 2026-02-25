import "server-only";

import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import path from "node:path";

import type {
  AuditAction,
  AuditLog,
  TimeEntry,
  TrackerDb
} from "@/types/time-tracker";

const DATA_DIR = path.join(process.cwd(), "data");
const SEED_PATH = path.join(DATA_DIR, "db.json");
const LOCAL_PATH = path.join(DATA_DIR, "db.local.json");

let writeQueue: Promise<void> = Promise.resolve();

async function ensureLocalDb() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await access(LOCAL_PATH);
  } catch {
    await copyFile(SEED_PATH, LOCAL_PATH);
  }
}

export async function readDb(): Promise<TrackerDb> {
  await ensureLocalDb();
  const raw = await readFile(LOCAL_PATH, "utf-8");
  return JSON.parse(raw) as TrackerDb;
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
      const db = await readDb();
      const result = await updater(db);
      await writeDb(db);
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
