"use client";

import { useEffect, useMemo, useState } from "react";

import { dashboardUrl, getJson } from "@/lib/client-api";
import { entriesToCsv } from "@/lib/csv";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { DashboardResponse, PeriodPreset } from "@/types/time-tracker";
import { EntriesTable } from "@/components/entries-table";
import { PeriodTabs } from "@/components/period-tabs";
import { SummaryCards } from "@/components/summary-cards";

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminDashboard() {
  const [preset, setPreset] = useState<PeriodPreset>("mtd");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function refreshDashboard(nextPreset = preset) {
    const response = await getJson<DashboardResponse>(dashboardUrl(nextPreset));
    setData(response);
  }

  useEffect(() => {
    let active = true;
    const pull = async () => {
      try {
        const response = await getJson<DashboardResponse>(dashboardUrl(preset));
        if (!active) return;
        setError("");
        setData(response);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    };

    void pull();
    const poll = setInterval(() => {
      void pull();
    }, 20_000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [preset]);

  const currency = data?.contract.currency ?? "USD";
  const actorUsers = useMemo(() => {
    if (!data) return [];
    const users = [data.currentUser, data.contractor];
    const seen = new Set<string>();
    return users.filter((user) => {
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
  }, [data]);

  async function saveEntry(entryId: string, patch: { startAtUtc: string; endAtUtc: string; notes: string }) {
    setSaving(true);
    try {
      await getJson(`/api/entries/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      await refreshDashboard(preset);
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    if (!data) return;
    const csv = entriesToCsv(data.entries, actorUsers);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`time-log-${preset}-${stamp}.csv`, csv);
  }

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <h1 className="heading">Admin Dashboard</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Monthly-focused reporting, billable totals, editable logs, and audit history.
          </p>
        </div>
        <div className="row">
          <PeriodTabs value={preset} onChange={setPreset} />
          <button className="btn" type="button" onClick={exportCsv} disabled={!data}>
            Export CSV
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {data ? <SummaryCards totals={data.totals} currency={currency} /> : <div className="muted">Loading...</div>}

      <div className="split-panels">
        <section className="panel pad stack">
          <div className="row spread">
            <div>
              <h2 className="subheading">Time Entries</h2>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Contractor timezone: {data?.contractor.timezone ?? "UTC"} | Range preset: {preset.toUpperCase()}
              </div>
            </div>
            {data?.activeTimer ? <span className="pill warn">Timer running</span> : <span className="pill">Timer stopped</span>}
          </div>

          {data ? (
            <EntriesTable
              entries={data.entries}
              timezone={data.contractor.timezone}
              currency={currency}
              editable
              onSave={saveEntry}
            />
          ) : null}
        </section>

        <section className="stack">
          <div className="panel pad stack">
            <div>
              <h2 className="subheading">Monthly Trend (last 6)</h2>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Accurate even if a session crosses month-end
              </div>
            </div>
            <div className="table-wrap">
              <table style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Minutes</th>
                    <th>Billable</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.monthlyBuckets.map((bucket) => (
                    <tr key={bucket.monthKey}>
                      <td>{bucket.monthKey}</td>
                      <td>{bucket.totalMinutes}</td>
                      <td>{formatCurrency(bucket.totalAmount, currency)}</td>
                    </tr>
                  )) ?? null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel pad stack">
            <div>
              <h2 className="subheading">Audit Log</h2>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Start/stop events and manual edits
              </div>
            </div>
            <div className="table-wrap">
              <table style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.auditLogs.length ? (
                    data.auditLogs.slice(0, 25).map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTime(log.timestampUtc, data.currentUser.timezone)}</td>
                        <td>{log.actorId === data.currentUser.id ? data.currentUser.name : data.contractor.name}</td>
                        <td>{log.action}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="muted">
                        No audit events yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {saving ? <div className="muted">Saving changes...</div> : null}
    </div>
  );
}
