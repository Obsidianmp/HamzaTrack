import type {
  ActiveTimer,
  Contract,
  DailyBucket,
  DateRange,
  MtdAverage,
  MonthlyBucket,
  PeriodPreset,
  ReportTotals,
  TimeEntry
} from "@/types/time-tracker";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekdayShort: string;
};

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();
const offsetFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getZonedFormatter(timezone: string) {
  const key = timezone;
  let fmt = zonedFormatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short"
    });
    zonedFormatterCache.set(key, fmt);
  }
  return fmt;
}

function getOffsetFormatter(timezone: string) {
  let fmt = offsetFormatterCache.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    offsetFormatterCache.set(timezone, fmt);
  }
  return fmt;
}

export function getZonedParts(date: Date, timezone: string): ZonedParts {
  const parts = getZonedFormatter(timezone).formatToParts(date);
  const partValue = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: Number(partValue("year")),
    month: Number(partValue("month")),
    day: Number(partValue("day")),
    hour: Number(partValue("hour")),
    minute: Number(partValue("minute")),
    second: Number(partValue("second")),
    weekdayShort: partValue("weekday")
  };
}

function parseShortOffset(offsetLabel: string) {
  // Examples: GMT+8, GMT-05:00
  const match = offsetLabel.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes) * 60_000;
}

export function getTimezoneOffsetMs(date: Date, timezone: string) {
  const parts = getOffsetFormatter(timezone).formatToParts(date);
  const label = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  return parseShortOffset(label);
}

export function zonedDateTimeToUtc(
  timezone: string,
  values: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number }
) {
  const year = values.year;
  const month = values.month;
  const day = values.day;
  const hour = values.hour ?? 0;
  const minute = values.minute ?? 0;
  const second = values.second ?? 0;
  const localEpoch = Date.UTC(year, month - 1, day, hour, minute, second);

  let candidate = new Date(localEpoch);
  let offset = getTimezoneOffsetMs(candidate, timezone);
  candidate = new Date(localEpoch - offset);
  const offset2 = getTimezoneOffsetMs(candidate, timezone);
  if (offset2 !== offset) {
    candidate = new Date(localEpoch - offset2);
  }
  return candidate;
}

function addDaysYmd(year: number, month: number, day: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1, day + delta, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function startOfWeekYmd(parts: ZonedParts) {
  const weekdayOrder: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  const current = weekdayOrder[parts.weekdayShort] ?? 1;
  const diffFromMonday = (current + 6) % 7;
  return addDaysYmd(parts.year, parts.month, parts.day, -diffFromMonday);
}

export function getPresetRange(preset: PeriodPreset, timezone: string, now = new Date()): DateRange {
  const parts = getZonedParts(now, timezone);
  let startDate = { year: parts.year, month: parts.month, day: parts.day };

  if (preset === "weekly") {
    startDate = startOfWeekYmd(parts);
  } else if (preset === "monthly" || preset === "mtd") {
    startDate = { year: parts.year, month: parts.month, day: 1 };
  } else if (preset === "ytd") {
    startDate = { year: parts.year, month: 1, day: 1 };
  }

  const start = zonedDateTimeToUtc(timezone, startDate);
  return {
    startUtc: start.toISOString(),
    endUtc: now.toISOString()
  };
}

export function getSpecificDayRange(dayKey: string, timezone: string): DateRange {
  const match = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("Invalid day format. Expected YYYY-MM-DD");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = zonedDateTimeToUtc(timezone, { year, month, day, hour: 0, minute: 0, second: 0 });
  const next = addDaysYmd(year, month, day, 1);
  const end = zonedDateTimeToUtc(timezone, { ...next, hour: 0, minute: 0, second: 0 });
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString()
  };
}

export function clampRange(range: DateRange) {
  const startMs = new Date(range.startUtc).getTime();
  const endMs = new Date(range.endUtc).getTime();
  const normalized = {
    startUtc: new Date(Math.min(startMs, endMs)).toISOString(),
    endUtc: new Date(Math.max(startMs, endMs)).toISOString()
  };
  return normalized;
}

export function calculateDurationMinutes(startAtUtc: string, endAtUtc: string) {
  const diffMs = new Date(endAtUtc).getTime() - new Date(startAtUtc).getTime();
  return Math.max(0, Math.floor(diffMs / 60_000));
}

export function calculateAmount(durationMinutes: number, rate: number) {
  return roundMoney((durationMinutes / 60) * rate);
}

export function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function applyContractToEntryDraft(
  contract: Contract,
  startAtUtc: string,
  endAtUtc: string
) {
  const durationMinutes = calculateDurationMinutes(startAtUtc, endAtUtc);
  return {
    durationMinutes,
    rateSnapshot: contract.hourlyRate,
    currency: contract.currency,
    amount: calculateAmount(durationMinutes, contract.hourlyRate)
  };
}

export function getClosedEntrySegments(entry: TimeEntry) {
  const segments = entry.segments?.length
    ? entry.segments
    : [{ startAtUtc: entry.startAtUtc, endAtUtc: entry.endAtUtc }];
  return segments.filter(
    (segment): segment is { startAtUtc: string; endAtUtc: string } =>
      typeof segment.startAtUtc === "string" && typeof segment.endAtUtc === "string"
  );
}

export function getWorkedMinutesForActiveTimer(timer: ActiveTimer, now = new Date()) {
  const segments = timer.segments?.length ? timer.segments : [{ startAtUtc: timer.startedAtUtc }];
  let totalMs = 0;
  for (const segment of segments) {
    const startMs = new Date(segment.startAtUtc).getTime();
    const endMs = segment.endAtUtc ? new Date(segment.endAtUtc).getTime() : now.getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      totalMs += endMs - startMs;
    }
  }
  return Math.floor(totalMs / 60_000);
}

function entryMinuteRateFromAmount(entry: TimeEntry) {
  const baseMinutes = Math.max(1, entry.durationMinutes);
  return entry.amount / baseMinutes;
}

function overlapMinutesAndAmount(entry: TimeEntry, range: DateRange) {
  let minutesTotal = 0;
  let amountTotal = 0;
  const segments = getClosedEntrySegments(entry);
  for (const segment of segments) {
    const startMs = Math.max(new Date(segment.startAtUtc).getTime(), new Date(range.startUtc).getTime());
    const endMs = Math.min(new Date(segment.endAtUtc).getTime(), new Date(range.endUtc).getTime());
    if (endMs <= startMs) continue;
    const minutes = Math.floor((endMs - startMs) / 60_000);
    if (minutes <= 0) continue;
    minutesTotal += minutes;
    amountTotal += minutes * entryMinuteRateFromAmount(entry);
  }
  return {
    minutes: minutesTotal,
    amount: roundMoney(amountTotal)
  };
}

export function buildTotalsForRange(entries: TimeEntry[], range: DateRange): ReportTotals {
  let totalMinutes = 0;
  let totalAmount = 0;
  let sessionCount = 0;

  for (const entry of entries) {
    const overlap = overlapMinutesAndAmount(entry, range);
    const minutes = overlap.minutes;
    if (minutes <= 0) continue;
    sessionCount += 1;
    totalMinutes += minutes;
    totalAmount += overlap.amount;
  }

  return {
    totalMinutes,
    totalHours: roundTo2(totalMinutes / 60),
    totalAmount: roundMoney(totalAmount),
    sessionCount
  };
}

export function filterEntriesByRange(entries: TimeEntry[], range: DateRange) {
  const startMs = new Date(range.startUtc).getTime();
  const endMs = new Date(range.endUtc).getTime();
  return entries.filter((entry) => {
    return getClosedEntrySegments(entry).some((segment) => {
      const entryStart = new Date(segment.startAtUtc).getTime();
      const entryEnd = new Date(segment.endAtUtc).getTime();
      return entryEnd > startMs && entryStart < endMs;
    });
  });
}

function nextMonthBoundaryUtc(date: Date, timezone: string) {
  const parts = getZonedParts(date, timezone);
  const nextMonth = parts.month === 12 ? { year: parts.year + 1, month: 1 } : { year: parts.year, month: parts.month + 1 };
  return zonedDateTimeToUtc(timezone, { year: nextMonth.year, month: nextMonth.month, day: 1 });
}

function monthKeyInTimezone(date: Date, timezone: string) {
  const parts = getZonedParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function dayKeyInTimezone(date: Date, timezone: string) {
  const parts = getZonedParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function buildMonthlyBuckets(
  entries: TimeEntry[],
  timezone: string,
  monthsBack = 6,
  now = new Date()
): MonthlyBucket[] {
  const nowParts = getZonedParts(now, timezone);
  const monthStarts: { key: string; start: Date; end: Date }[] = [];

  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const anchor = new Date(Date.UTC(nowParts.year, nowParts.month - 1 - i, 1, 0, 0, 0));
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth() + 1;
    const start = zonedDateTimeToUtc(timezone, { year: y, month: m, day: 1 });
    const nextAnchor = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    const nextY = nextAnchor.getUTCFullYear();
    const nextM = nextAnchor.getUTCMonth() + 1;
    const end = zonedDateTimeToUtc(timezone, { year: nextY, month: nextM, day: 1 });
    monthStarts.push({
      key: `${y}-${String(m).padStart(2, "0")}`,
      start,
      end
    });
  }

  const buckets = new Map<string, MonthlyBucket>();
  for (const month of monthStarts) {
    buckets.set(month.key, {
      monthKey: month.key,
      totalMinutes: 0,
      totalAmount: 0
    });
  }

  for (const entry of entries) {
    for (const worked of getClosedEntrySegments(entry)) {
      let cursor = new Date(worked.startAtUtc);
      const entryEnd = new Date(worked.endAtUtc);
      while (cursor < entryEnd) {
        const key = monthKeyInTimezone(cursor, timezone);
        const boundary = nextMonthBoundaryUtc(cursor, timezone);
        const segmentEnd = boundary < entryEnd ? boundary : entryEnd;
        const minutes = Math.floor((segmentEnd.getTime() - cursor.getTime()) / 60_000);
        if (minutes > 0 && buckets.has(key)) {
          const bucket = buckets.get(key)!;
          bucket.totalMinutes += minutes;
          bucket.totalAmount = roundMoney(bucket.totalAmount + minutes * entryMinuteRateFromAmount(entry));
        }
        if (segmentEnd.getTime() <= cursor.getTime()) break;
        cursor = segmentEnd;
      }
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function nextDayBoundaryUtc(date: Date, timezone: string) {
  const parts = getZonedParts(date, timezone);
  const next = addDaysYmd(parts.year, parts.month, parts.day, 1);
  return zonedDateTimeToUtc(timezone, { ...next, hour: 0, minute: 0, second: 0 });
}

export function buildDailyBucketsForRange(
  entries: TimeEntry[],
  range: DateRange,
  timezone: string
): DailyBucket[] {
  const buckets = new Map<string, DailyBucket>();
  const rangeStart = new Date(range.startUtc);
  const rangeEnd = new Date(range.endUtc);

  for (const entry of entries) {
    for (const workedSegment of getClosedEntrySegments(entry)) {
      const segmentStartMs = Math.max(new Date(workedSegment.startAtUtc).getTime(), rangeStart.getTime());
      const segmentEndMs = Math.min(new Date(workedSegment.endAtUtc).getTime(), rangeEnd.getTime());
      if (segmentEndMs <= segmentStartMs) continue;

      let cursor = new Date(segmentStartMs);
      const end = new Date(segmentEndMs);
      while (cursor < end) {
        const key = dayKeyInTimezone(cursor, timezone);
        const boundary = nextDayBoundaryUtc(cursor, timezone);
        const segmentEnd = boundary < end ? boundary : end;
        const minutes = Math.floor((segmentEnd.getTime() - cursor.getTime()) / 60_000);
        if (minutes > 0) {
          const existing = buckets.get(key) ?? {
            dayKey: key,
            totalMinutes: 0,
            totalAmount: 0
          };
          existing.totalMinutes += minutes;
          existing.totalAmount = roundMoney(existing.totalAmount + minutes * entryMinuteRateFromAmount(entry));
          buckets.set(key, existing);
        }
        if (segmentEnd.getTime() <= cursor.getTime()) break;
        cursor = segmentEnd;
      }
    }
  }

  return Array.from(buckets.values()).sort((a, b) => b.dayKey.localeCompare(a.dayKey));
}

export function buildMtdAverage(entries: TimeEntry[], timezone: string, now = new Date()): MtdAverage {
  const mtdRange = clampRange(getPresetRange("mtd", timezone, now));
  const totals = buildTotalsForRange(entries, mtdRange);
  const parts = getZonedParts(now, timezone);
  const dayCount = Math.max(1, parts.day);
  const avgMinutesPerDay = roundTo2(totals.totalMinutes / dayCount);
  return {
    dayCount,
    totalMinutes: totals.totalMinutes,
    avgMinutesPerDay,
    avgHoursPerDay: roundTo2(avgMinutesPerDay / 60)
  };
}

export function getMonthRange(monthKey: string, timezone: string): DateRange {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error("Invalid month format. Expected YYYY-MM");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = zonedDateTimeToUtc(timezone, { year, month, day: 1, hour: 0, minute: 0, second: 0 });
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const end = zonedDateTimeToUtc(timezone, { ...nextMonth, day: 1, hour: 0, minute: 0, second: 0 });
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

export function roundTo2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function safeTimezone(value?: string | null) {
  if (!value) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}
