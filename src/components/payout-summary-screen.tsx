"use client";

import { useEffect, useState, useTransition } from "react";

import { getJson } from "@/lib/client-api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { PayoutSummaryResponse } from "@/types/time-tracker";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function PayoutSummaryScreen() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<PayoutSummaryResponse | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  async function load(selectedMonth = month) {
    const response = await getJson<PayoutSummaryResponse>(`/api/payout-summary?month=${selectedMonth}`);
    setData(response);
  }

  useEffect(() => {
    let active = true;
    void getJson<PayoutSummaryResponse>(`/api/payout-summary?month=${month}`)
      .then((response) => {
        if (!active) return;
        setError("");
        setData(response);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load payout summary");
      });
    return () => {
      active = false;
    };
  }, [month]);

  function toggleApproval(entryId: string, approvedForPayout: boolean) {
    setError("");
    startTransition(async () => {
      try {
        await getJson(`/api/entries/${entryId}/approve`, {
          method: "PATCH",
          body: JSON.stringify({ approvedForPayout })
        });
        await load(month);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update approval");
      }
    });
  }

  return (
    <div className="stack">
      <section className="panel pad stack">
        <div className="dashboard-toolbar">
          <div>
            <h1 className="heading">Monthly Payout Summary</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              Approval and payout review in fixed billing timezone (New York).
            </p>
          </div>
          <div className="row">
            <div className="field" style={{ minWidth: 180 }}>
              <label htmlFor="payout-month">Month</label>
              <input
                id="payout-month"
                type="month"
                className="input"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn primary"
              style={{ alignSelf: "end" }}
              onClick={() => startTransition(async () => load().catch((err) => setError(err.message)))}
              disabled={pending}
            >
              {pending ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}

        {data ? (
          <>
            <div className="grid-4">
              <div className="card-stat">
                <div className="label">Approved Hours</div>
                <div className="value">{data.totals.approvedHours.toFixed(2)}</div>
              </div>
              <div className="card-stat">
                <div className="label">Overrides</div>
                <div className="value">{data.totals.overrideCount}</div>
              </div>
              <div className="card-stat">
                <div className="label">Total Due</div>
                <div className="value">{formatCurrency(data.totals.approvedAmount, data.currency)}</div>
              </div>
              <div className="card-stat">
                <div className="label">Pending Review</div>
                <div className="value">{data.totals.pendingReviewHours.toFixed(2)}h</div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              Month: {data.monthKey} · Billing timezone: {data.billingTimezone}
            </div>
          </>
        ) : (
          <div className="muted">Loading...</div>
        )}
      </section>

      <section className="panel pad stack">
        <div>
          <h2 className="subheading">Entries</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Contractor edits default to unapproved until reviewed.
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Hours</th>
                <th>Amount</th>
                <th>Flags</th>
                <th>Reason</th>
                <th>Approval</th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.length ? (
                data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.startAtUtc, data.billingTimezone)}</td>
                    <td>{formatDateTime(entry.endAtUtc, data.billingTimezone)}</td>
                    <td>{(entry.durationMinutes / 60).toFixed(2)}</td>
                    <td>{formatCurrency(entry.amount, data.currency)}</td>
                    <td>
                      <div className="row">
                        {entry.amountOverridden ? <span className="pill warn">Override</span> : null}
                        {entry.lastEditedByRole === "contractor" ? (
                          <span className="pill contractor-edited-pill">Contractor edit</span>
                        ) : null}
                        <span className="pill">{entry.source}</span>
                      </div>
                    </td>
                    <td>{entry.lastEditReason || entry.notes || <span className="muted">-</span>}</td>
                    <td>
                      <button
                        type="button"
                        className={`btn ${entry.approvedForPayout ? "primary" : ""}`}
                        disabled={pending}
                        onClick={() => toggleApproval(entry.id, !entry.approvedForPayout)}
                      >
                        {entry.approvedForPayout ? "Approved" : "Approve"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    No entries found for this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
