import type {
  ActiveTimer,
  Contract,
  DashboardResponse,
  PeriodPreset,
  TimeEntry,
  TrackerDb,
  User
} from "@/types/time-tracker";
import { appendAuditLog, createId, getStorageInfo, nowUtcIso, readDb, sortEntriesDesc, updateDb } from "@/lib/db";
import {
  applyContractToEntryDraft,
  buildDailyBucketsForRange,
  buildMtdAverage,
  buildMonthlyBuckets,
  buildTotalsForRange,
  clampRange,
  filterEntriesByRange,
  getPresetRange,
  safeTimezone
} from "@/lib/time";

export function getDefaultContractor(db: TrackerDb): User {
  const contractorId = db.appSettings.defaultContractorUserId;
  const contractor = db.users.find((user) => user.id === contractorId && user.role === "contractor");
  if (!contractor) {
    throw new Error("Configured contractor not found");
  }
  return contractor;
}

export function getContractForUser(db: TrackerDb, userId: string): Contract {
  const contract = db.contracts.find((item) => item.userId === userId);
  if (!contract) {
    throw new Error("Contract not found");
  }
  return contract;
}

function getActiveTimerForUser(db: TrackerDb, userId: string): ActiveTimer | null {
  return db.activeTimers.find((timer) => timer.userId === userId) ?? null;
}

function hasOverlappingEntry(
  entries: TimeEntry[],
  userId: string,
  startAtUtc: string,
  endAtUtc: string,
  excludeId?: string
) {
  const startMs = new Date(startAtUtc).getTime();
  const endMs = new Date(endAtUtc).getTime();
  return entries.some((entry) => {
    if (entry.userId !== userId) return false;
    if (excludeId && entry.id === excludeId) return false;
    const entryStart = new Date(entry.startAtUtc).getTime();
    const entryEnd = new Date(entry.endAtUtc).getTime();
    return startMs < entryEnd && endMs > entryStart;
  });
}

export async function loadDashboard(
  currentUser: User,
  preset: PeriodPreset,
  requestedTimezone?: string | null
): Promise<DashboardResponse> {
  const db = await readDb();
  const contractor = getDefaultContractor(db);
  const contract = getContractForUser(db, contractor.id);
  const timezone = safeTimezone(requestedTimezone ?? contractor.timezone);

  const baseEntries =
    currentUser.role === "admin"
      ? db.timeEntries.filter((entry) => entry.userId === contractor.id)
      : db.timeEntries.filter((entry) => entry.userId === currentUser.id);

  const range = clampRange(getPresetRange(preset, timezone));
  const inRangeEntries = sortEntriesDesc(filterEntriesByRange(baseEntries, range));
  const totals = buildTotalsForRange(baseEntries, range);
  const monthlyBuckets = buildMonthlyBuckets(baseEntries, timezone, 6);
  const dailyBuckets = buildDailyBucketsForRange(baseEntries, range, timezone);
  const mtdAverage = buildMtdAverage(baseEntries, timezone);
  const activeTimer =
    currentUser.role === "admin"
      ? getActiveTimerForUser(db, contractor.id)
      : getActiveTimerForUser(db, currentUser.id);

  return {
    currentUser,
    contractor,
    contract,
    activeTimer,
    range: {
      ...range,
      preset,
      timezone
    },
    totals,
    entries: inRangeEntries,
    auditLogs:
      currentUser.role === "admin"
        ? [...db.auditLogs]
            .filter((log) => log.targetId === contractor.id || log.actorId === contractor.id || log.actorId === currentUser.id)
            .sort((a, b) => b.timestampUtc.localeCompare(a.timestampUtc))
            .slice(0, 100)
        : [],
    monthlyBuckets,
    dailyBuckets,
    mtdAverage,
    storage: getStorageInfo()
  };
}

export async function startTimer(currentUser: User) {
  if (currentUser.role !== "contractor") {
    throw new Error("Only contractor can start timer");
  }

  return updateDb((db) => {
    const existing = getActiveTimerForUser(db, currentUser.id);
    if (existing) {
      throw new Error("Timer is already running");
    }

    const startedAtUtc = nowUtcIso();
    const timer: ActiveTimer = {
      userId: currentUser.id,
      startedAtUtc,
      startedByUserId: currentUser.id,
      source: "web"
    };
    db.activeTimers.push(timer);

    appendAuditLog(db, {
      actorId: currentUser.id,
      action: "timer_start",
      targetType: "timer",
      targetId: currentUser.id,
      metadata: { startedAtUtc }
    });

    return timer;
  });
}

export async function stopTimer(currentUser: User) {
  if (currentUser.role !== "contractor") {
    throw new Error("Only contractor can stop timer");
  }

  return updateDb((db) => {
    const timer = getActiveTimerForUser(db, currentUser.id);
    if (!timer) {
      throw new Error("No active timer");
    }

    const contract = getContractForUser(db, currentUser.id);
    const endAtUtc = nowUtcIso();

    if (new Date(endAtUtc).getTime() <= new Date(timer.startedAtUtc).getTime()) {
      throw new Error("Timer stop time must be after start time");
    }

    if (
      hasOverlappingEntry(db.timeEntries, currentUser.id, timer.startedAtUtc, endAtUtc)
    ) {
      throw new Error("Stopping would create overlapping entry");
    }

    const billing = applyContractToEntryDraft(contract, timer.startedAtUtc, endAtUtc);
    const entry: TimeEntry = {
      id: createId("entry"),
      userId: currentUser.id,
      startAtUtc: timer.startedAtUtc,
      endAtUtc,
      ...billing,
      notes: "",
      source: "timer",
      edited: false,
      createdAtUtc: endAtUtc,
      updatedAtUtc: endAtUtc
    };
    db.timeEntries.push(entry);
    db.activeTimers = db.activeTimers.filter((item) => item.userId !== currentUser.id);

    appendAuditLog(db, {
      actorId: currentUser.id,
      action: "timer_stop",
      targetType: "entry",
      targetId: entry.id,
      metadata: {
        startAtUtc: entry.startAtUtc,
        endAtUtc: entry.endAtUtc,
        durationMinutes: entry.durationMinutes,
        amount: entry.amount
      }
    });

    return entry;
  });
}

export async function updateEntry(
  currentUser: User,
  entryId: string,
  payload: { startAtUtc?: string; endAtUtc?: string; notes?: string; amount?: number }
) {
  return updateDb((db) => {
    const entry = db.timeEntries.find((item) => item.id === entryId);
    if (!entry) throw new Error("Entry not found");
    const isAdmin = currentUser.role === "admin";
    const isOwner = entry.userId === currentUser.id;
    if (!isAdmin && !(currentUser.role === "contractor" && isOwner)) {
      throw new Error("Not allowed to edit this entry");
    }
    if (!isAdmin && payload.amount !== undefined) {
      throw new Error("Only admin can edit payment amount");
    }

    const nextStart = payload.startAtUtc ?? entry.startAtUtc;
    const nextEnd = payload.endAtUtc ?? entry.endAtUtc;
    if (new Date(nextEnd).getTime() <= new Date(nextStart).getTime()) {
      throw new Error("End time must be after start time");
    }

    if (hasOverlappingEntry(db.timeEntries, entry.userId, nextStart, nextEnd, entry.id)) {
      throw new Error("Edited entry overlaps another entry");
    }

    const active = getActiveTimerForUser(db, entry.userId);
    if (active) {
      const activeStart = new Date(active.startedAtUtc).getTime();
      const startMs = new Date(nextStart).getTime();
      const endMs = new Date(nextEnd).getTime();
      if (startMs < Date.now() && endMs > activeStart) {
        throw new Error("Edited entry overlaps active timer");
      }
    }

    const oldEntry = { ...entry };
    entry.startAtUtc = nextStart;
    entry.endAtUtc = nextEnd;
    if (payload.notes !== undefined) {
      entry.notes = payload.notes;
    }
    entry.durationMinutes = Math.max(
      0,
      Math.floor((new Date(nextEnd).getTime() - new Date(nextStart).getTime()) / 60_000)
    );
    const calculatedAmount =
      Math.round(((entry.durationMinutes / 60) * entry.rateSnapshot + Number.EPSILON) * 100) / 100;
    entry.amount =
      isAdmin && typeof payload.amount === "number" && Number.isFinite(payload.amount)
        ? Math.max(0, Math.round((payload.amount + Number.EPSILON) * 100) / 100)
        : calculatedAmount;
    entry.edited = true;
    entry.updatedAtUtc = nowUtcIso();

    appendAuditLog(db, {
      actorId: currentUser.id,
      action: "entry_edit",
      targetType: "entry",
      targetId: entry.id,
      metadata: {
        editedByRole: currentUser.role,
        before: oldEntry,
        after: entry
      }
    });

    return entry;
  });
}

export async function createManualEntry(
  currentUser: User,
  payload: { startAtUtc?: string; endAtUtc?: string; notes?: string }
) {
  if (currentUser.role !== "admin") {
    throw new Error("Only admin can create manual entries");
  }

  const startAtUtc = payload.startAtUtc;
  const endAtUtc = payload.endAtUtc;
  if (!startAtUtc || !endAtUtc) {
    throw new Error("startAtUtc and endAtUtc are required");
  }

  return updateDb((db) => {
    const contractor = getDefaultContractor(db);
    const contract = getContractForUser(db, contractor.id);

    if (new Date(endAtUtc).getTime() <= new Date(startAtUtc).getTime()) {
      throw new Error("End time must be after start time");
    }

    if (hasOverlappingEntry(db.timeEntries, contractor.id, startAtUtc, endAtUtc)) {
      throw new Error("Manual entry overlaps an existing entry");
    }

    const active = getActiveTimerForUser(db, contractor.id);
    if (active) {
      const activeStart = new Date(active.startedAtUtc).getTime();
      const startMs = new Date(startAtUtc).getTime();
      const endMs = new Date(endAtUtc).getTime();
      if (startMs < Date.now() && endMs > activeStart) {
        throw new Error("Manual entry overlaps the active timer");
      }
    }

    const nowUtc = nowUtcIso();
    const billing = applyContractToEntryDraft(contract, startAtUtc, endAtUtc);
    const entry: TimeEntry = {
      id: createId("entry"),
      userId: contractor.id,
      startAtUtc,
      endAtUtc,
      ...billing,
      notes: payload.notes?.trim() ?? "",
      source: "manual",
      edited: false,
      createdAtUtc: nowUtc,
      updatedAtUtc: nowUtc
    };
    db.timeEntries.push(entry);

    appendAuditLog(db, {
      actorId: currentUser.id,
      action: "entry_create",
      targetType: "entry",
      targetId: entry.id,
      metadata: {
        source: "manual",
        startAtUtc,
        endAtUtc,
        durationMinutes: entry.durationMinutes,
        amount: entry.amount
      }
    });

    return entry;
  });
}

export async function loadSettings(currentUser: User) {
  const db = await readDb();
  if (currentUser.role !== "admin") {
    throw new Error("Only admin can view settings");
  }
  const contractor = getDefaultContractor(db);
  const contract = getContractForUser(db, contractor.id);
  return {
    contractor,
    contract,
    users: db.users
  };
}

export async function updateSettings(
  currentUser: User,
  payload: { hourlyRate?: number; currency?: string; contractorTimezone?: string; adminTimezone?: string }
) {
  if (currentUser.role !== "admin") {
    throw new Error("Only admin can update settings");
  }

  return updateDb((db) => {
    const contractor = getDefaultContractor(db);
    const contract = getContractForUser(db, contractor.id);
    const admin = db.users.find((user) => user.id === currentUser.id);

    const before = {
      hourlyRate: contract.hourlyRate,
      currency: contract.currency,
      contractorTimezone: contractor.timezone,
      adminTimezone: admin?.timezone
    };

    if (typeof payload.hourlyRate === "number" && Number.isFinite(payload.hourlyRate)) {
      contract.hourlyRate = Math.max(0, payload.hourlyRate);
    }
    if (typeof payload.currency === "string" && payload.currency.trim()) {
      contract.currency = payload.currency.trim().toUpperCase();
    }
    if (typeof payload.contractorTimezone === "string" && payload.contractorTimezone.trim()) {
      contractor.timezone = payload.contractorTimezone.trim();
    }
    if (admin && typeof payload.adminTimezone === "string" && payload.adminTimezone.trim()) {
      admin.timezone = payload.adminTimezone.trim();
    }

    appendAuditLog(db, {
      actorId: currentUser.id,
      action: "settings_update",
      targetType: "settings",
      targetId: "contractor-settings",
      metadata: {
        before,
        after: {
          hourlyRate: contract.hourlyRate,
          currency: contract.currency,
          contractorTimezone: contractor.timezone,
          adminTimezone: admin?.timezone
        }
      }
    });

    return {
      contractor,
      contract,
      users: db.users
    };
  });
}
