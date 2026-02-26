"use client";

import { useMemo, useState } from "react";

import { formatCurrency, formatDateOnly, formatDateTime } from "@/lib/format";
import { getZonedParts, zonedDateTimeToUtc } from "@/lib/time";
import type { TimeEntry } from "@/types/time-tracker";

type EditDraft = {
  startLocal: string;
  endLocal: string;
  notes: string;
  amount: string;
  editReason: string;
};

function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  const tzOffset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffset * 60_000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(localValue: string) {
  return new Date(localValue).toISOString();
}

function getWeekInfo(iso: string, timezone: string) {
  const date = new Date(iso);
  const parts = getZonedParts(date, timezone);
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
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - diffFromMonday, 12, 0, 0));
  const mondayY = monday.getUTCFullYear();
  const mondayM = monday.getUTCMonth() + 1;
  const mondayD = monday.getUTCDate();
  const weekKey = `${mondayY}-${String(mondayM).padStart(2, "0")}-${String(mondayD).padStart(2, "0")}`;
  const mondayUtc = zonedDateTimeToUtc(timezone, { year: mondayY, month: mondayM, day: mondayD });
  return {
    weekKey,
    weekLabel: `Week of ${formatDateOnly(mondayUtc.toISOString(), timezone)}`
  };
}

export function EntriesTable({
  entries,
  timezone,
  currency,
  editable = false,
  canEditAmount = false,
  requireEditReason = false,
  onSave
}: {
  entries: TimeEntry[];
  timezone: string;
  currency: string;
  editable?: boolean;
  canEditAmount?: boolean;
  requireEditReason?: boolean;
  onSave?: (entryId: string, patch: { startAtUtc: string; endAtUtc: string; notes: string; amount?: number; editReason?: string }) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const rows = useMemo(() => {
    const output: Array<
      | { type: "week"; weekKey: string; label: string }
      | { type: "entry"; entry: TimeEntry }
    > = [];
    let currentWeekKey: string | null = null;
    for (const entry of entries) {
      const week = getWeekInfo(entry.startAtUtc, timezone);
      if (week.weekKey !== currentWeekKey) {
        currentWeekKey = week.weekKey;
        output.push({ type: "week", weekKey: week.weekKey, label: week.weekLabel });
      }
      output.push({ type: "entry", entry });
    }
    return output;
  }, [entries, timezone]);

  function startEdit(entry: TimeEntry) {
    setError("");
    setEditingId(entry.id);
    setDraft({
      startLocal: toLocalInputValue(entry.startAtUtc),
      endLocal: toLocalInputValue(entry.endAtUtc),
      notes: entry.notes ?? "",
      amount: entry.amount.toFixed(2),
      editReason: ""
    });
  }

  async function saveEdit() {
    if (!editingId || !draft || !onSave) return;
    setSaving(true);
    setError("");
    try {
      const parsedAmount = Number(draft.amount);
      if (canEditAmount && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
        throw new Error("Amount must be a valid non-negative number");
      }
      const current = entryMap.get(editingId);
      const timeChanged =
        !!current && (localInputToIso(draft.startLocal) !== current.startAtUtc || localInputToIso(draft.endLocal) !== current.endAtUtc);
      if (requireEditReason && timeChanged && !draft.editReason.trim()) {
        throw new Error("Edit reason is required when changing time");
      }
      await onSave(editingId, {
        startAtUtc: localInputToIso(draft.startLocal),
        endAtUtc: localInputToIso(draft.endLocal),
        notes: draft.notes,
        amount: canEditAmount ? Math.round((parsedAmount + Number.EPSILON) * 100) / 100 : undefined,
        editReason: draft.editReason.trim() || undefined
      });
      setEditingId(null);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      {error ? <div className="error">{error}</div> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Minutes</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Notes</th>
              <th>Source</th>
              <th>Edit Reason</th>
              <th>Status</th>
              {editable ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={editable ? 10 : 9} className="muted">
                  No entries in this range yet.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              if (row.type === "week") {
                return (
                  <tr key={`week-${row.weekKey}`} className="week-index-row">
                    <td colSpan={editable ? 10 : 9} className="week-index-cell">
                      {row.label}
                    </td>
                  </tr>
                );
              }
              const entry = row.entry;
              const isEditing = entry.id === editingId && draft;
              const contractorEdited = entry.lastEditedByRole === "contractor";
              const timeCellClass = contractorEdited ? "contractor-edited-text" : undefined;
              return (
                <tr key={entry.id}>
                  <td>
                    {isEditing ? (
                      <input
                        className="input"
                        type="datetime-local"
                        value={draft.startLocal}
                        required
                        onChange={(e) => setDraft({ ...draft, startLocal: e.target.value })}
                      />
                    ) : (
                      <span className={timeCellClass}>{formatDateTime(entry.startAtUtc, timezone)}</span>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="input"
                        type="datetime-local"
                        value={draft.endLocal}
                        required
                        onChange={(e) => setDraft({ ...draft, endLocal: e.target.value })}
                      />
                    ) : (
                      <span className={timeCellClass}>{formatDateTime(entry.endAtUtc, timezone)}</span>
                    )}
                  </td>
                  <td>
                    <span className={timeCellClass}>{entry.durationMinutes}</span>
                  </td>
                  <td>
                    {formatCurrency(entry.rateSnapshot, currency).replace(/\.00$/, "")}/hr
                  </td>
                  <td>
                    {isEditing && canEditAmount ? (
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        min="0"
                        value={draft.amount}
                        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                      />
                    ) : (
                      formatCurrency(entry.amount, currency)
                    )}
                  </td>
                  <td style={{ minWidth: 180 }}>
                    {isEditing ? (
                      <input
                        className="input"
                        value={draft.notes}
                        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                        maxLength={200}
                      />
                    ) : (
                      entry.notes || <span className="muted">-</span>
                    )}
                  </td>
                  <td>
                    <span className="pill">{entry.source === "manual" ? "manual" : "timer"}</span>
                  </td>
                  <td style={{ minWidth: 180 }}>
                    {isEditing ? (
                      <input
                        className="input"
                        value={draft.editReason}
                        onChange={(e) => setDraft({ ...draft, editReason: e.target.value })}
                        placeholder={requireEditReason ? "Required if time changes" : "Optional"}
                        maxLength={200}
                      />
                    ) : entry.lastEditReason ? (
                      <span className={contractorEdited ? "contractor-edited-text" : undefined}>{entry.lastEditReason}</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>
                    {entry.edited ? (
                      <span className={`pill warn ${contractorEdited ? "contractor-edited-pill" : ""}`}>
                        {contractorEdited ? "Edited by contractor" : "Edited"}
                      </span>
                    ) : (
                      <span className="pill">Saved</span>
                    )}
                  </td>
                  {editable ? (
                    <td>
                      {isEditing ? (
                        <div className="row">
                          <button type="button" className="btn primary" disabled={saving} onClick={saveEdit}>
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={saving}
                            onClick={() => {
                              setEditingId(null);
                              setDraft(null);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            const current = entryMap.get(entry.id);
                            if (current) startEdit(current);
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
