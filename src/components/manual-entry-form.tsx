"use client";

import { useMemo, useState } from "react";

import { getJson } from "@/lib/client-api";
import { formatCurrency } from "@/lib/format";

function toLocalInputValue(date: Date) {
  const tzOffset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ManualEntryForm({
  hourlyRate,
  currency,
  onCreated
}: {
  hourlyRate: number;
  currency: string;
  onCreated: () => Promise<void>;
}) {
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setHours(9, 0, 0, 0);
  const defaultEnd = new Date(now);
  defaultEnd.setHours(10, 0, 0, 0);

  const [startLocal, setStartLocal] = useState(() => toLocalInputValue(defaultStart));
  const [endLocal, setEndLocal] = useState(() => toLocalInputValue(defaultEnd));
  const [notes, setNotes] = useState("");
  const [billableAmount, setBillableAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const preview = useMemo(() => {
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    const minutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
    const amount = Math.round(((minutes / 60) * hourlyRate + Number.EPSILON) * 100) / 100;
    return { minutes, amount };
  }, [endLocal, hourlyRate, startLocal]);

  const parsedOverrideAmount = Number(billableAmount);
  const hasAmountOverride = billableAmount.trim() !== "";
  const effectiveAmount =
    hasAmountOverride && Number.isFinite(parsedOverrideAmount) && parsedOverrideAmount >= 0
      ? Math.round((parsedOverrideAmount + Number.EPSILON) * 100) / 100
      : preview.amount;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (hasAmountOverride && (!Number.isFinite(parsedOverrideAmount) || parsedOverrideAmount < 0)) {
      setError("Billable amount override must be a non-negative number.");
      return;
    }
    setSaving(true);
    try {
      await getJson("/api/entries", {
        method: "POST",
        body: JSON.stringify({
          startAtUtc: new Date(startLocal).toISOString(),
          endAtUtc: new Date(endLocal).toISOString(),
          notes,
          amount: hasAmountOverride ? effectiveAmount : undefined
        })
      });
      setSuccess("Manual entry added.");
      setBillableAmount("");
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="panel-header">
        <div>
          <h2 className="subheading">Manual Day Adjustment</h2>
          <div className="muted small">
            Add a manual time block to correct a day’s total (admin only).
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="field">
          <label htmlFor="manual-start">Start (your local time)</label>
          <input
            id="manual-start"
            className="input"
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="manual-end">End (your local time)</label>
          <input
            id="manual-end"
            className="input"
            type="datetime-local"
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="manual-notes">Notes</label>
        <input
          id="manual-notes"
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Adjustment reason (optional)"
          maxLength={200}
        />
      </div>

      <div className="field">
        <label htmlFor="manual-billable">Billable Amount Override (optional)</label>
        <input
          id="manual-billable"
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={billableAmount}
          onChange={(e) => setBillableAmount(e.target.value)}
          placeholder={`Auto from rate (${formatCurrency(preview.amount, currency)})`}
        />
      </div>

      <div className="row">
        <span className="pill">Preview: {preview.minutes} min</span>
        <span className="pill">
          Billable: {formatCurrency(effectiveAmount, currency)}
          {hasAmountOverride ? " (override)" : ""}
        </span>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="row">
        <button className="btn primary" type="submit" disabled={saving || preview.minutes <= 0}>
          {saving ? "Adding..." : "Add Manual Entry"}
        </button>
      </div>
    </form>
  );
}
