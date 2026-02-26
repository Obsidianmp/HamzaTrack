"use client";

import { useEffect, useState, useTransition } from "react";

import { dashboardUrl, getJson, reportPdfUrl, reportUrl } from "@/lib/client-api";
import { formatCurrency, formatElapsed } from "@/lib/format";
import type { ActiveTimer, DashboardResponse, PeriodPreset } from "@/types/time-tracker";
import { EntriesTable } from "@/components/entries-table";
import { PeriodTabs } from "@/components/period-tabs";
import { SummaryCards } from "@/components/summary-cards";
import { TimezoneModeToggle } from "@/components/timezone-mode-toggle";

function getElapsedMs(timer: ActiveTimer | null, nowMs: number) {
  if (!timer) return 0;
  const segments = timer.segments?.length ? timer.segments : [{ startAtUtc: timer.startedAtUtc }];
  let total = 0;
  for (const segment of segments) {
    const startMs = new Date(segment.startAtUtc).getTime();
    const endMs = segment.endAtUtc ? new Date(segment.endAtUtc).getTime() : nowMs;
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      total += endMs - startMs;
    }
  }
  return total;
}

export function ContractorDashboard() {
  const [preset, setPreset] = useState<PeriodPreset>("mtd");
  const [timezoneMode, setTimezoneMode] = useState<"billing" | "display">("billing");
  const [showHistory, setShowHistory] = useState(false);
  const [historyDay, setHistoryDay] = useState("");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const [savingEdit, setSavingEdit] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const effectiveTimezone = data?.range.timezone ?? "UTC";

  async function refreshDashboard(
    nextPreset = preset,
    nextHistoryDay = historyDay || undefined,
    nextTimezoneMode = timezoneMode
  ) {
    setError("");
    const response = await getJson<DashboardResponse>(dashboardUrl(nextPreset, undefined, nextHistoryDay, nextTimezoneMode));
    setData(response);
  }

  useEffect(() => {
    let active = true;
    const pull = async () => {
      try {
        const response = await getJson<DashboardResponse>(
          dashboardUrl(preset, undefined, historyDay || undefined, timezoneMode)
        );
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
  }, [preset, historyDay, timezoneMode]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedLabel = formatElapsed(getElapsedMs(data?.activeTimer ?? null, now));
  const timerStatus = data?.activeTimer?.status ?? null;
  const timerStartedLabel = data?.activeTimer?.segments?.[0]?.startAtUtc ?? data?.activeTimer?.startedAtUtc ?? null;

  async function runTimerAction(action: "start" | "pause" | "resume" | "stop") {
    if (!data) return;
    setError("");
    startTransition(async () => {
      try {
        const path =
          action === "start"
            ? "/api/timer/start"
            : action === "pause"
              ? "/api/timer/pause"
              : action === "resume"
                ? "/api/timer/resume"
                : "/api/timer/stop";
        await getJson(path, { method: "POST" });
        await refreshDashboard(preset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Timer action failed");
      }
    });
  }

  async function saveEntry(
    entryId: string,
    patch: { startAtUtc: string; endAtUtc: string; notes: string; amount?: number; editReason?: string }
  ) {
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
              Track time and log work sessions. Billing reports can be viewed in New York billing time or your display timezone.
            </p>
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
              {timerStatus ? (
                <div className="muted" style={{ fontSize: 14 }}>
                  {timerStatus === "paused" ? "Paused" : "Running"}
                  {timerStartedLabel ? ` · Started ${new Date(timerStartedLabel).toLocaleString()}` : ""}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 14 }}>
                  Timer is stopped
                </div>
              )}
            </div>
            <div className="stack" style={{ justifyItems: "start", minWidth: "min(100%, 320px)" }}>
              <div className="row button-group-wrap">
                {!data?.activeTimer ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => runTimerAction("start")}
                    disabled={busy || !data}
                    style={{ minWidth: 140 }}
                  >
                    {busy ? "Working..." : "Start Timer"}
                  </button>
                ) : (
                  <>
                    {timerStatus === "running" ? (
                      <button type="button" className="btn" onClick={() => runTimerAction("pause")} disabled={busy}>
                        {busy ? "Working..." : "Pause Timer"}
                      </button>
                    ) : (
                      <button type="button" className="btn" onClick={() => runTimerAction("resume")} disabled={busy}>
                        {busy ? "Working..." : "Resume Timer"}
                      </button>
                    )}
                    <button type="button" className="btn primary" onClick={() => runTimerAction("stop")} disabled={busy}>
                      {busy ? "Working..." : "Log Work Session"}
                    </button>
                  </>
                )}
              </div>
              {data ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  Rate: {formatCurrency(data.contract.hourlyRate, data.contract.currency)}/hr
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {data ? (
          <div className="toolbar-actions">
            <TimezoneModeToggle
              value={timezoneMode}
              billingTimezone={data.range.billingTimezone ?? "America/New_York"}
              displayTimezone={data.range.displayTimezone ?? data.currentUser.timezone}
              onChange={(next) => {
                setHistoryDay("");
                setTimezoneMode(next);
              }}
            />
          </div>
        ) : null}

        <div className="toolbar-actions">
          <PeriodTabs
            value={preset}
            onChange={(next) => {
              setHistoryDay("");
              setPreset(next);
            }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => window.location.assign(reportUrl(preset, undefined, historyDay || undefined, timezoneMode))}
            disabled={!data}
          >
            Download CSV
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => window.location.assign(reportPdfUrl(preset, undefined, historyDay || undefined, timezoneMode))}
            disabled={!data}
          >
            Export PDF
          </button>
          <button type="button" className="btn" onClick={() => window.location.assign("/api/backup")}>
            Backup / Export All
          </button>
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
              Viewing in {timezoneMode === "billing" ? "Billing Time" : "Display Time"}: {effectiveTimezone}
              {data?.range.selectedDay ? ` | History day: ${data.range.selectedDay}` : ""}
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "Close History" : "History"}
            </button>
            {data?.range.selectedDay ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setHistoryDay("");
                  setPreset("mtd");
                }}
              >
                Back to MTD
              </button>
            ) : null}
          </div>
        </div>
        {showHistory ? (
          <div className="history-controls">
            <div className="field">
              <label htmlFor="contractor-history-day">Select Day</label>
              <input
                id="contractor-history-day"
                type="date"
                className="input"
                value={historyDay}
                onChange={(e) => setHistoryDay(e.target.value)}
              />
            </div>
            <div className="row">
              <button type="button" className="btn" disabled={!historyDay} onClick={() => setPreset("daily")}>
                View Day
              </button>
            </div>
          </div>
        ) : null}
        {data ? (
          <EntriesTable
            entries={data.entries}
            timezone={effectiveTimezone}
            currency={data.contract.currency}
            editable
            canEditAmount={false}
            requireEditReason
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
