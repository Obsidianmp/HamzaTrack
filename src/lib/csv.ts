import type { TimeEntry, User } from "@/types/time-tracker";

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
