import { formatCurrency } from "@/lib/format";
import { formatDuration } from "@/lib/time";
import type { ReportTotals } from "@/types/time-tracker";

export function SummaryCards({
  totals,
  currency
}: {
  totals: ReportTotals;
  currency: string;
}) {
  return (
    <div className="grid-4">
      <div className="card-stat">
        <div className="label">Total Time</div>
        <div className="value">{formatDuration(totals.totalMinutes)}</div>
      </div>
      <div className="card-stat">
        <div className="label">Total Hours</div>
        <div className="value">{totals.totalHours.toFixed(2)}</div>
      </div>
      <div className="card-stat">
        <div className="label">Billable</div>
        <div className="value">{formatCurrency(totals.totalAmount, currency)}</div>
      </div>
      <div className="card-stat">
        <div className="label">Sessions</div>
        <div className="value">{totals.sessionCount}</div>
      </div>
    </div>
  );
}
