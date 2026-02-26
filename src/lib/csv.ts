import type { DashboardResponse, TimeEntry, User } from "@/types/time-tracker";

export function entriesToCsv(entries: TimeEntry[], users: User[]) {
  const userMap = new Map(users.map((user) => [user.id, user]));
  const rows = [
    [
      "Entry ID",
      "User",
      "Start (UTC)",
      "End (UTC)",
      "Duration Minutes",
      "Rate",
      "Currency",
      "Amount",
      "Notes",
      "Edited"
    ]
  ];

  for (const entry of entries) {
    rows.push([
      entry.id,
      userMap.get(entry.userId)?.name ?? entry.userId,
      entry.startAtUtc,
      entry.endAtUtc,
      String(entry.durationMinutes),
      String(entry.rateSnapshot),
      entry.currency,
      String(entry.amount),
      entry.notes ?? "",
      entry.edited ? "yes" : "no"
    ]);
  }

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string) {
  const normalized = value.replaceAll('"', '""');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized}"`;
  }
  return normalized;
}

export function dashboardReportToCsv(data: DashboardResponse) {
  const rows: string[][] = [];
  rows.push(["HamzaTrack Report"]);
  rows.push(["Preset", data.range.preset.toUpperCase()]);
  rows.push(["Timezone", data.range.timezone]);
  rows.push(["Start UTC", data.range.startUtc]);
  rows.push(["End UTC", data.range.endUtc]);
  rows.push([]);
  rows.push(["Totals"]);
  rows.push(["Total Minutes", String(data.totals.totalMinutes)]);
  rows.push(["Total Hours", String(data.totals.totalHours)]);
  rows.push(["Total Billable", String(data.totals.totalAmount)]);
  rows.push(["Session Count", String(data.totals.sessionCount)]);
  rows.push([]);
  rows.push(["MTD Average"]);
  rows.push(["Day Count", String(data.mtdAverage.dayCount)]);
  rows.push(["MTD Total Minutes", String(data.mtdAverage.totalMinutes)]);
  rows.push(["Avg Minutes / Day", String(data.mtdAverage.avgMinutesPerDay)]);
  rows.push(["Avg Hours / Day", String(data.mtdAverage.avgHoursPerDay)]);
  rows.push([]);
  rows.push(["Daily Totals"]);
  rows.push(["Day", "Minutes", "Amount"]);
  for (const bucket of data.dailyBuckets) {
    rows.push([bucket.dayKey, String(bucket.totalMinutes), String(bucket.totalAmount)]);
  }
  rows.push([]);
  rows.push(["Entries"]);
  rows.push([
    "Entry ID",
    "Start UTC",
    "End UTC",
    "Minutes",
    "Rate",
    "Currency",
    "Amount",
    "Notes",
    "Source",
    "Edited"
  ]);
  for (const entry of data.entries) {
    rows.push([
      entry.id,
      entry.startAtUtc,
      entry.endAtUtc,
      String(entry.durationMinutes),
      String(entry.rateSnapshot),
      entry.currency,
      String(entry.amount),
      entry.notes ?? "",
      entry.source,
      entry.edited ? "yes" : "no"
    ]);
  }
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell ?? "")).join(",")).join("\n");
}
