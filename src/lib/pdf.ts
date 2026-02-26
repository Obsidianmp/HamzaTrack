import type { DashboardResponse } from "@/types/time-tracker";
import { formatCurrency, formatDateTime } from "@/lib/format";

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function buildSimplePdf(lines: string[]) {
  const safeLines = lines.slice(0, 56);
  const commands: string[] = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL"];
  for (const line of safeLines) {
    commands.push(`(${escapePdfText(line)}) Tj`);
    commands.push("T*");
  }
  commands.push("ET");
  const content = commands.join("\n");
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content);

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream\nendobj\n`
  ];

  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(output.length);
    output += object;
  }
  const xrefOffset = output.length;
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(output);
}

export function dashboardReportToPdf(data: DashboardResponse) {
  const timezone = data.range.timezone;
  const lines: string[] = [];
  lines.push("HamzaTrack Report Summary");
  lines.push(`Preset: ${data.range.preset.toUpperCase()}   Timezone: ${timezone}`);
  lines.push(`Range: ${data.range.startUtc} -> ${data.range.endUtc}`);
  lines.push("");
  lines.push(`Total Time: ${data.totals.totalMinutes} min (${data.totals.totalHours.toFixed(2)} h)`);
  lines.push(`Billable: ${formatCurrency(data.totals.totalAmount, data.contract.currency)}   Sessions: ${data.totals.sessionCount}`);
  lines.push(`MTD Avg/Day: ${(data.mtdAverage.avgMinutesPerDay / 60).toFixed(2)} h (${data.mtdAverage.dayCount}d)`);
  lines.push("");
  lines.push("Daily Totals");
  for (const bucket of data.dailyBuckets.slice(0, 10)) {
    lines.push(`- ${bucket.dayKey}: ${bucket.totalMinutes} min | ${formatCurrency(bucket.totalAmount, data.contract.currency)}`);
  }
  if (data.dailyBuckets.length > 10) {
    lines.push(`... ${data.dailyBuckets.length - 10} more days`);
  }
  lines.push("");
  lines.push("Entries");
  for (const entry of data.entries.slice(0, 15)) {
    lines.push(
      `- ${formatDateTime(entry.startAtUtc, timezone)} -> ${formatDateTime(entry.endAtUtc, timezone)} | ${entry.durationMinutes}m | ${formatCurrency(entry.amount, data.contract.currency)}${entry.amountOverridden ? " (override)" : ""}`
    );
  }
  if (data.entries.length > 15) {
    lines.push(`... ${data.entries.length - 15} more entries (see CSV for full detail)`);
  }

  return buildSimplePdf(lines);
}
