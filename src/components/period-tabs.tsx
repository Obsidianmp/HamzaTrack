"use client";

import type { PeriodPreset } from "@/types/time-tracker";

const PERIODS: { key: PeriodPreset; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" }
];

export function PeriodTabs({
  value,
  onChange
}: {
  value: PeriodPreset;
  onChange: (next: PeriodPreset) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Period filter">
      {PERIODS.map((period) => (
        <button
          key={period.key}
          type="button"
          role="tab"
          aria-selected={value === period.key}
          className={value === period.key ? "active" : ""}
          onClick={() => onChange(period.key)}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
