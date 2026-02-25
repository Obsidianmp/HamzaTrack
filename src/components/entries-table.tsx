"use client";

import { useMemo, useState } from "react";

import { formatCurrency, formatDateTime } from "@/lib/format";
import type { TimeEntry } from "@/types/time-tracker";

type EditDraft = {
  startLocal: string;
  endLocal: string;
  notes: string;
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

export function EntriesTable({
  entries,
  timezone,
  currency,
  editable = false,
  onSave
}: {
  entries: TimeEntry[];
  timezone: string;
  currency: string;
  editable?: boolean;
  onSave?: (entryId: string, patch: { startAtUtc: string; endAtUtc: string; notes: string }) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  function startEdit(entry: TimeEntry) {
    setError("");
    setEditingId(entry.id);
    setDraft({
      startLocal: toLocalInputValue(entry.startAtUtc),
      endLocal: toLocalInputValue(entry.endAtUtc),
      notes: entry.notes ?? ""
    });
  }

  async function saveEdit() {
    if (!editingId || !draft || !onSave) return;
    setSaving(true);
    setError("");
    try {
      await onSave(editingId, {
        startAtUtc: localInputToIso(draft.startLocal),
        endAtUtc: localInputToIso(draft.endLocal),
        notes: draft.notes
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
              <th>Status</th>
              {editable ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={editable ? 8 : 7} className="muted">
                  No entries in this range yet.
                </td>
              </tr>
            ) : null}
            {entries.map((entry) => {
              const isEditing = entry.id === editingId && draft;
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
                      formatDateTime(entry.startAtUtc, timezone)
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
                      formatDateTime(entry.endAtUtc, timezone)
                    )}
                  </td>
                  <td>{entry.durationMinutes}</td>
                  <td>
                    {formatCurrency(entry.rateSnapshot, currency).replace(/\.00$/, "")}/hr
                  </td>
                  <td>{formatCurrency(entry.amount, currency)}</td>
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
                    {entry.edited ? <span className="pill warn">Edited</span> : <span className="pill">Saved</span>}
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
