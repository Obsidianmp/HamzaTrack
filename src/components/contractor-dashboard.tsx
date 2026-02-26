"use client";

import { useEffect, useState, useTransition } from "react";

import { dashboardUrl, getJson, reportUrl } from "@/lib/client-api";
import { formatCurrency, formatElapsed } from "@/lib/format";
import type { DashboardResponse, PeriodPreset } from "@/types/time-tracker";
import { PeriodTabs } from "@/components/period-tabs";
import { SummaryCards } from "@/components/summary-cards";
import { EntriesTable } from "@/components/entries-table";

export function ContractorDashboard() {
  const [preset, setPreset] = useState<PeriodPreset>("mtd");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const [savingEdit, setSavingEdit] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const timezone = data?.contractor.timezone ?? "UTC";

  async function refreshDashboard(nextPreset = preset) {
    setError("");
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
    }, 15_000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [preset]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedLabel = data?.activeTimer
    ? formatElapsed(now - new Date(data.activeTimer.startedAtUtc).getTime())
    : "00:00:00";

  async function toggleTimer() {
    if (!data) return;
    setError("");
    startTransition(async () => {
      try {
        await getJson(data.activeTimer ? "/api/timer/stop" : "/api/timer/start", { method: "POST" });
        await refreshDashboard(preset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Timer action failed");
      }
    });
  }

  async function saveEntry(entryId: string, patch: { startAtUtc: string; endAtUtc: string; notes: string; amount?: number }) {
    setSavingEdit(true);
    try {
      await getJson(`/api/entries/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      await refreshDashboard(preset);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="stack">
      <section className="panel pad stack simple-top">
        <div className="dashboard-toolbar">
          <div>
            <h1 className="heading">Contractor Timer</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              Track time, review the log, and adjust time entries when needed.
            </p>
          </div>
          <div className="toolbar-actions">
            <PeriodTabs
              value={preset}
              onChange={(next) => {
                setPreset(next);
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => window.location.assign(reportUrl(preset))}
              disabled={!data}
            >
              Download Report
            </button>
          </div>
        </div>

        {data && !data.storage.durable ? (
          <div className="warning-banner">
            <strong>Storage warning:</strong> {data.storage.note ?? "Current storage is not durable."}
          </div>
        ) : null}

        <div className="timer-box">
          <div className="row spread">
            <div>
              <div className="muted">Current timer</div>
              <div className="timer-display">{elapsedLabel}</div>
              {data?.activeTimer ? (
                <div className="muted" style={{ fontSize: 14 }}>
                  Started {new Date(data.activeTimer.startedAtUtc).toLocaleString()}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 14 }}>
                  Timer is stopped
                </div>
              )}
            </div>
            <div className="stack" style={{ justifyItems: "start" }}>
              <button
                type="button"
                className={`btn ${data?.activeTimer ? "danger" : "primary"}`}
                onClick={toggleTimer}
                disabled={busy || !data}
                style={{ minWidth: 140 }}
              >
                {busy ? "Working..." : data?.activeTimer ? "Stop Timer" : "Start Timer"}
              </button>
              {data ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  Rate: {formatCurrency(data.contract.hourlyRate, data.contract.currency)}/hr
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}

      {data ? (
        <SummaryCards
          totals={data.totals}
          currency={data.contract.currency}
          extras={[
            {
              label: `Avg / Day (MTD, ${data.mtdAverage.dayCount}d)`,
              value: `${(data.mtdAverage.avgMinutesPerDay / 60).toFixed(2)}h`
            }
          ]}
        />
      ) : null}

      <div className="panel pad stack">
        <div className="row spread">
          <div>
            <h2 className="subheading">Time Log</h2>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Period timezone: {timezone}
            </div>
          </div>
        </div>
        {data ? (
          <EntriesTable
            entries={data.entries}
            timezone={timezone}
            currency={data.contract.currency}
            editable
            canEditAmount={false}
            onSave={saveEntry}
          />
        ) : (
          <div className="muted">Loading...</div>
        )}
      </div>

      {savingEdit ? <div className="muted">Saving entry changes...</div> : null}
    </div>
  );
}
