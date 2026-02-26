import type {
  ActiveTimer,
  Contract,
  DashboardResponse,
  PeriodPreset,
  PayoutSummaryResponse,
  TimeEntry,
  TimerSegment,
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
  calculateAmount,
  calculateDurationMinutes,
  clampRange,
  filterEntriesByRange,
  getClosedEntrySegments,
  getMonthRange,
  getPresetRange,
  getSpecificDayRange,
  getZonedParts,
  roundMoney,
  roundTo2,
  safeTimezone
} from "@/lib/time";

type TimezoneMode = "billing" | "display";

function getBillingTimezone(db: TrackerDb) {
  return safeTimezone(db.appSettings.billingTimezone ?? "America/New_York");
}

function normalizeActiveTimer(timer: ActiveTimer | null): ActiveTimer | null {
  if (!timer) return null;
  const segments =
    timer.segments?.length && timer.segments.some((segment) => segment?.startAtUtc)
      ? timer.segments
      : [{ startAtUtc: timer.startedAtUtc }];
  const openSegment = [...segments].reverse().find((segment) => !segment.endAtUtc);
  return {
    ...timer,
    status: openSegment ? "running" : timer.status === "paused" ? "paused" : "paused",
    pausedAtUtc: timer.pausedAtUtc ?? null,
    segments,
    startedAtUtc: timer.startedAtUtc ?? segments[0]?.startAtUtc ?? nowUtcIso(),
    startedByUserId: timer.startedByUserId ?? timer.userId,
    source: timer.source ?? "web"
  };
}

function getActiveTimerForUser(db: TrackerDb, userId: string): ActiveTimer | null {
  return normalizeActiveTimer(db.activeTimers.find((timer) => timer.userId === userId) ?? null);
}

function timeRangesOverlap(aStartUtc: string, aEndUtc: string, bStartUtc: string, bEndUtc: string) {
  const aStart = new Date(aStartUtc).getTime();
  const aEnd = new Date(aEndUtc).getTime();
  const bStart = new Date(bStartUtc).getTime();
  const bEnd = new Date(bEndUtc).getTime();
  return aStart < bEnd && aEnd > bStart;
}

function hasOverlappingEntry(
  entries: TimeEntry[],
  userId: string,
  startAtUtc: string,
  endAtUtc: string,
  excludeId?: string
) {
  return entries.some((entry) => {
    if (entry.userId !== userId) return false;
    if (excludeId && entry.id === excludeId) return false;
    return getClosedEntrySegments(entry).some((segment) => timeRangesOverlap(startAtUtc, endAtUtc, segment.startAtUtc, segment.endAtUtc));
  });
}

function hasOverlapWithSegments(
  entries: TimeEntry[],
  userId: string,
  segments: Array<{ startAtUtc: string; endAtUtc: string }>,
  excludeId?: string
) {
  return segments.some((segment) => hasOverlappingEntry(entries, userId, segment.startAtUtc, segment.endAtUtc, excludeId));
}

function getClosedTimerSegments(timer: ActiveTimer, nowUtc = nowUtcIso()) {
  const normalized = normalizeActiveTimer(timer);
  if (!normalized) return [];
  const endNowMs = new Date(nowUtc).getTime();
  return (normalized.segments ?? [])
    .filter((segment): segment is { startAtUtc: string; endAtUtc?: string } => Boolean(segment?.startAtUtc))
    .map((segment) => {
      if (segment.endAtUtc) return { startAtUtc: segment.startAtUtc, endAtUtc: segment.endAtUtc };
      const startMs = new Date(segment.startAtUtc).getTime();
      if (endNowMs <= startMs) {
        return null;
      }
      return { startAtUtc: segment.startAtUtc, endAtUtc: nowUtc };
    })
    .filter((segment): segment is { startAtUtc: string; endAtUtc: string } => Boolean(segment))
    .filter((segment) => new Date(segment.endAtUtc).getTime() > new Date(segment.startAtUtc).getTime());
}

function getActiveTimerWorkedMs(timer: ActiveTimer, nowMs = Date.now()) {
  const normalized = normalizeActiveTimer(timer);
  if (!normalized) return 0;
  let total = 0;
  for (const segment of normalized.segments ?? []) {
    const startMs = new Date(segment.startAtUtc).getTime();
    const endMs = segment.endAtUtc ? new Date(segment.endAtUtc).getTime() : nowMs;
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      total += endMs - startMs;
    }
  }
  return total;
}

function getActiveTimerStartUtc(timer: ActiveTimer) {
  const normalized = normalizeActiveTimer(timer);
  if (!normalized) return null;
  return normalized.segments?.[0]?.startAtUtc ?? normalized.startedAtUtc;
}

function getDisplayTimezoneForUser(currentUser: User) {
  return safeTimezone(currentUser.timezone);
}

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

export async function loadDashboard(
  currentUser: User,
  preset: PeriodPreset,
  requestedTimezone?: string | null,
  selectedDay?: string | null,
  requestedTimezoneMode?: TimezoneMode | null
): Promise<DashboardResponse> {
  const db = await readDb();
  const contractor = getDefaultContractor(db);
  const contract = getContractForUser(db, contractor.id);
  const billingTimezone = getBillingTimezone(db);
  const displayTimezone = safeTimezone(requestedTimezone ?? getDisplayTimezoneForUser(currentUser));
  const timezoneMode: TimezoneMode = requestedTimezoneMode === "display" ? "display" : "billing";
  const timezone = timezoneMode === "billing" ? billingTimezone : displayTimezone;

  const baseEntries =
    currentUser.role === "admin"
      ? db.timeEntries.filter((entry) => entry.userId === contractor.id)
      : db.timeEntries.filter((entry) => entry.userId === currentUser.id);

  const effectivePreset = selectedDay ? "daily" : preset;
  const range = clampRange(selectedDay ? getSpecificDayRange(selectedDay, timezone) : getPresetRange(effectivePreset, timezone));
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
      preset: effectivePreset,
      timezone,
      timezoneMode,
      billingTimezone,
      displayTimezone,
      selectedDay: selectedDay ?? null
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
      throw new Error("Timer session is already active. Pause, resume, or log it first.");
    }

    const startedAtUtc = nowUtcIso();
    const timer: ActiveTimer = {
      userId: currentUser.id,
      startedAtUtc,
      startedByUserId: currentUser.id,
      source: "web",
      status: "running",
      pausedAtUtc: null,
      segments: [{ startAtUtc: startedAtUtc }]
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

export async function pauseTimer(currentUser: User) {
  if (currentUser.role !== "contractor") {
    throw new Error("Only contractor can pause timer");
  }

  return updateDb((db) => {
    const timerIndex = db.activeTimers.findIndex((timer) => timer.userId === currentUser.id);
    if (timerIndex < 0) throw new Error("No active timer session");
    const timer = normalizeActiveTimer(db.activeTimers[timerIndex]);
    if (!timer) throw new Error("No active timer session");
    if (timer.status === "paused") {
      throw new Error("Timer is already paused");
    }
    const nowUtc = nowUtcIso();
    const segments = [...(timer.segments ?? [])];
    const openIndex = segments.findIndex((segment) => !segment.endAtUtc);
    if (openIndex < 0) throw new Error("No running timer segment");
    if (new Date(nowUtc).getTime() <= new Date(segments[openIndex].startAtUtc).getTime()) {
      throw new Error("Pause time must be after segment start");
    }
    segments[openIndex] = { ...segments[openIndex], endAtUtc: nowUtc };
    const nextTimer: ActiveTimer = {
      ...timer,
      status: "paused",
      pausedAtUtc: nowUtc,
      segments
    };
    db.activeTimers[timerIndex] = nextTimer;

    appendAuditLog(db, {
      actorId: currentUser.id,
      action: "timer_pause",
      targetType: "timer",
      targetId: currentUser.id,
      metadata: { pausedAtUtc: nowUtc }
    });

    return nextTimer;
  });
}

export async function resumeTimer(currentUser: User) {
  if (currentUser.role !== "contractor") {
    throw new Error("Only contractor can resume timer");
  }

  return updateDb((db) => {
    const timerIndex = db.activeTimers.findIndex((timer) => timer.userId === currentUser.id);
    if (timerIndex < 0) throw new Error("No active timer session");
    const timer = normalizeActiveTimer(db.activeTimers[timerIndex]);
    if (!timer) throw new Error("No active timer session");
    if (timer.status !== "paused") {
      throw new Error("Timer is already running");
    }
    const resumedAtUtc = nowUtcIso();
    const segments = [...(timer.segments ?? [])];
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && !lastSegment.endAtUtc) {
      throw new Error("Cannot resume while a segment is still open");
    }
    segments.push({ startAtUtc: resumedAtUtc });
    const nextTimer: ActiveTimer = {
      ...timer,
      status: "running",
      pausedAtUtc: null,
      segments
    };
    db.activeTimers[timerIndex] = nextTimer;

    appendAuditLog(db, {
      actorId: currentUser.id,
      action: "timer_resume",
      targetType: "timer",
      targetId: currentUser.id,
      metadata: { resumedAtUtc }
    });

    return nextTimer;
  });
}

export async function stopTimer(currentUser: User) {
  if (currentUser.role !== "contractor") {
    throw new Error("Only contractor can log work session");
  }

  return updateDb((db) => {
    const timer = getActiveTimerForUser(db, currentUser.id);
    if (!timer) {
      throw new Error("No active timer session");
    }

    const contract = getContractForUser(db, currentUser.id);
    const nowUtc = nowUtcIso();
    const workedSegments = getClosedTimerSegments(timer, nowUtc);
    if (workedSegments.length === 0) {
      throw new Error("No worked time to log");
    }
    if (hasOverlapWithSegments(db.timeEntries, currentUser.id, workedSegments)) {
      throw new Error("Logging this session would overlap an existing entry");
    }

    const firstStart = workedSegments[0].startAtUtc;
    const lastEnd = workedSegments[workedSegments.length - 1].endAtUtc;
    const durationMinutes = workedSegments.reduce(
      (total, segment) => total + calculateDurationMinutes(segment.startAtUtc, segment.endAtUtc),
      0
    );
    if (durationMinutes <= 0) {
      throw new Error("Work session must be at least one minute");
    }

    const baseBilling = applyContractToEntryDraft(contract, firstStart, lastEnd);
    const entry: TimeEntry = {
      id: createId("entry"),
      userId: currentUser.id,
      startAtUtc: firstStart,
      endAtUtc: lastEnd,
      ...baseBilling,
      durationMinutes,
      amount: calculateAmount(durationMinutes, contract.hourlyRate),
      notes: "",
      source: "timer",
      segments: workedSegments,
      edited: false,
      lastEditedByRole: undefined,
      approvedForPayout: true,
      amountOverridden: false,
      createdAtUtc: nowUtc,
      updatedAtUtc: nowUtc
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
        amount: entry.amount,
        segmentCount: workedSegments.length
      }
    });

    return entry;
  });
}

export async function updateEntry(
  currentUser: User,
  entryId: string,
  payload: { startAtUtc?: string; endAtUtc?: string; notes?: string; amount?: number; editReason?: string }
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

    const timeChanged = nextStart !== entry.startAtUtc || nextEnd !== entry.endAtUtc;
    const trimmedEditReason = payload.editReason?.trim();
    if (!isAdmin && timeChanged && !trimmedEditReason) {
      throw new Error("Please provide an edit reason when changing time");
    }

    if (hasOverlappingEntry(db.timeEntries, entry.userId, nextStart, nextEnd, entry.id)) {
      throw new Error("Edited entry overlaps another entry");
    }

    const active = getActiveTimerForUser(db, entry.userId);
    if (active) {
      const candidateSegment = { startAtUtc: nextStart, endAtUtc: nextEnd };
      const activeSegments = getClosedTimerSegments(active).concat(
        (active.segments ?? [])
          .filter((segment) => !segment.endAtUtc)
          .map((segment) => ({ startAtUtc: segment.startAtUtc, endAtUtc: nowUtcIso() }))
      );
      if (activeSegments.some((segment) => timeRangesOverlap(candidateSegment.startAtUtc, candidateSegment.endAtUtc, segment.startAtUtc, segment.endAtUtc))) {
        throw new Error("Edited entry overlaps active timer");
      }
    }

    const oldEntry = structuredClone(entry);
    entry.startAtUtc = nextStart;
    entry.endAtUtc = nextEnd;
    entry.segments = [{ startAtUtc: nextStart, endAtUtc: nextEnd }];
    if (payload.notes !== undefined) {
      entry.notes = payload.notes;
    }
    entry.durationMinutes = calculateDurationMinutes(nextStart, nextEnd);
    const calculatedAmount = calculateAmount(entry.durationMinutes, entry.rateSnapshot);
    const usingAdminAmountOverride =
      isAdmin && typeof payload.amount === "number" && Number.isFinite(payload.amount);
    if (usingAdminAmountOverride) {
      entry.amount = Math.max(0, roundMoney(payload.amount as number));
      entry.amountOverridden = true;
    } else if (timeChanged) {
      entry.amount = calculatedAmount;
      entry.amountOverridden = false;
    }
    entry.edited = true;
    entry.lastEditedByRole = currentUser.role;
    entry.lastEditReason = trimmedEditReason || (isAdmin ? entry.lastEditReason : undefined);
    if (!isAdmin) {
      entry.approvedForPayout = false;
      entry.approvedAtUtc = undefined;
      entry.approvedByUserId = undefined;
    }
    entry.updatedAtUtc = nowUtcIso();

    appendAuditLog(db, {
      actorId: currentUser.id,
      action: "entry_edit",
      targetType: "entry",
      targetId: entry.id,
      metadata: {
        editedByRole: currentUser.role,
        editReason: trimmedEditReason ?? null,
        before: oldEntry,
        after: entry
      }
    });

    return entry;
  });
}

export async function setEntryApproval(currentUser: User, entryId: string, approvedForPayout: boolean) {
  if (currentUser.role !== "admin") {
    throw new Error("Only admin can approve payout entries");
  }

  return updateDb((db) => {
    const entry = db.timeEntries.find((item) => item.id === entryId);
    if (!entry) throw new Error("Entry not found");
    entry.approvedForPayout = approvedForPayout;
    entry.approvedAtUtc = approvedForPayout ? nowUtcIso() : undefined;
    entry.approvedByUserId = approvedForPayout ? currentUser.id : undefined;
    entry.updatedAtUtc = nowUtcIso();

    appendAuditLog(db, {
      actorId: currentUser.id,
      action: "entry_approve",
      targetType: "entry",
      targetId: entry.id,
      metadata: { approvedForPayout }
    });

    return entry;
  });
}

export async function createManualEntry(
  currentUser: User,
  payload: { startAtUtc?: string; endAtUtc?: string; notes?: string; amount?: number }
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
      const activeSegments = getClosedTimerSegments(active).concat(
        (active.segments ?? [])
          .filter((segment) => !segment.endAtUtc)
          .map((segment) => ({ startAtUtc: segment.startAtUtc, endAtUtc: nowUtcIso() }))
      );
      if (activeSegments.some((segment) => timeRangesOverlap(startAtUtc, endAtUtc, segment.startAtUtc, segment.endAtUtc))) {
        throw new Error("Manual entry overlaps the active timer");
      }
    }

    const nowUtc = nowUtcIso();
    const billing = applyContractToEntryDraft(contract, startAtUtc, endAtUtc);
    const overrideAmount =
      typeof payload.amount === "number" && Number.isFinite(payload.amount)
        ? Math.max(0, roundMoney(payload.amount))
        : undefined;
    const entry: TimeEntry = {
      id: createId("entry"),
      userId: contractor.id,
      startAtUtc,
      endAtUtc,
      ...billing,
      amount: overrideAmount ?? billing.amount,
      notes: payload.notes?.trim() ?? "",
      source: "manual",
      segments: [{ startAtUtc, endAtUtc }],
      edited: false,
      lastEditedByRole: undefined,
      approvedForPayout: true,
      amountOverridden: overrideAmount !== undefined,
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
        amount: entry.amount,
        amountOverride: overrideAmount ?? null
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
    users: db.users,
    appSettings: {
      billingTimezone: getBillingTimezone(db)
    }
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
    db.appSettings.billingTimezone = "America/New_York";

    const before = {
      hourlyRate: contract.hourlyRate,
      currency: contract.currency,
      contractorTimezone: contractor.timezone,
      adminTimezone: admin?.timezone,
      billingTimezone: db.appSettings.billingTimezone
    };

    if (typeof payload.hourlyRate === "number" && Number.isFinite(payload.hourlyRate)) {
      contract.hourlyRate = Math.max(0, payload.hourlyRate);
    }
    if (typeof payload.currency === "string" && payload.currency.trim()) {
      contract.currency = payload.currency.trim().toUpperCase();
    }
    if (typeof payload.contractorTimezone === "string" && payload.contractorTimezone.trim()) {
      contractor.timezone = safeTimezone(payload.contractorTimezone.trim());
    }
    if (admin && typeof payload.adminTimezone === "string" && payload.adminTimezone.trim()) {
      admin.timezone = safeTimezone(payload.adminTimezone.trim());
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
          adminTimezone: admin?.timezone,
          billingTimezone: db.appSettings.billingTimezone
        }
      }
    });

    return {
      contractor,
      contract,
      users: db.users,
      appSettings: {
        billingTimezone: db.appSettings.billingTimezone
      }
    };
  });
}

export async function loadPayoutSummary(currentUser: User, requestedMonthKey?: string | null): Promise<PayoutSummaryResponse> {
  if (currentUser.role !== "admin") {
    throw new Error("Only admin can view payout summaries");
  }
  const db = await readDb();
  const contractor = getDefaultContractor(db);
  const contract = getContractForUser(db, contractor.id);
  const billingTimezone = getBillingTimezone(db);
  const nowParts = getZonedParts(new Date(), billingTimezone);
  const defaultMonthKey = `${nowParts.year}-${String(nowParts.month).padStart(2, "0")}`;
  const monthKey = requestedMonthKey?.match(/^\d{4}-\d{2}$/) ? requestedMonthKey : defaultMonthKey;
  const range = getMonthRange(monthKey, billingTimezone);

  const entries = sortEntriesDesc(
    filterEntriesByRange(db.timeEntries.filter((entry) => entry.userId === contractor.id), range)
  );

  const allTotals = buildTotalsForRange(entries, range);
  const approvedTotals = buildTotalsForRange(
    entries.filter((entry) => entry.approvedForPayout ?? true),
    range
  );
  let overrideCount = 0;

  for (const entry of entries) {
    if (entry.amountOverridden) {
      overrideCount += 1;
    }
  }

  return {
    monthKey,
    billingTimezone,
    currency: contract.currency,
    totals: {
      totalMinutes: allTotals.totalMinutes,
      totalHours: allTotals.totalHours,
      totalAmount: allTotals.totalAmount,
      approvedMinutes: approvedTotals.totalMinutes,
      approvedHours: approvedTotals.totalHours,
      approvedAmount: approvedTotals.totalAmount,
      pendingReviewMinutes: allTotals.totalMinutes - approvedTotals.totalMinutes,
      pendingReviewHours: roundTo2((allTotals.totalMinutes - approvedTotals.totalMinutes) / 60),
      overrideCount
    },
    entries: entries.map((entry) => ({
      id: entry.id,
      startAtUtc: entry.startAtUtc,
      endAtUtc: entry.endAtUtc,
      durationMinutes: entry.durationMinutes,
      amount: entry.amount,
      amountOverridden: Boolean(entry.amountOverridden),
      approvedForPayout: entry.approvedForPayout ?? true,
      edited: entry.edited,
      lastEditedByRole: entry.lastEditedByRole,
      lastEditReason: entry.lastEditReason,
      notes: entry.notes,
      source: entry.source
    }))
  };
}

export async function exportBackupPayload(currentUser: User) {
  const db = await readDb();
  const contractor = getDefaultContractor(db);
  const billingTimezone = getBillingTimezone(db);

  if (currentUser.role === "admin") {
    return {
      exportedAtUtc: nowUtcIso(),
      scope: "admin",
      billingTimezone,
      data: db
    };
  }

  return {
    exportedAtUtc: nowUtcIso(),
    scope: "contractor",
    billingTimezone,
    data: {
      users: db.users.filter((user) => user.id === currentUser.id),
      contracts: db.contracts.filter((contract) => contract.userId === currentUser.id),
      appSettings: {
        defaultContractorUserId: contractor.id,
        billingTimezone
      },
      activeTimers: db.activeTimers.filter((timer) => timer.userId === currentUser.id),
      timeEntries: db.timeEntries.filter((entry) => entry.userId === currentUser.id),
      auditLogs: db.auditLogs.filter((log) => log.actorId === currentUser.id || log.targetId === currentUser.id)
    }
  };
}

export function getElapsedMsForActiveTimer(timer: ActiveTimer | null, nowMs = Date.now()) {
  return timer ? getActiveTimerWorkedMs(timer, nowMs) : 0;
}

export function getActiveTimerStatus(timer: ActiveTimer | null) {
  return normalizeActiveTimer(timer)?.status ?? null;
}

export function getActiveTimerDisplayStart(timer: ActiveTimer | null) {
  return timer ? getActiveTimerStartUtc(timer) : null;
}
