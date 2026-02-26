"use client";

export function TimezoneModeToggle({
  value,
  billingTimezone,
  displayTimezone,
  onChange
}: {
  value: "billing" | "display";
  billingTimezone: string;
  displayTimezone: string;
  onChange: (next: "billing" | "display") => void;
}) {
  return (
    <div className="timezone-mode-toggle" role="tablist" aria-label="Timezone mode">
      <button
        type="button"
        role="tab"
        aria-selected={value === "billing"}
        className={value === "billing" ? "active" : ""}
        onClick={() => onChange("billing")}
        title={billingTimezone}
      >
        Billing TZ (NY)
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "display"}
        className={value === "display" ? "active" : ""}
        onClick={() => onChange("display")}
        title={displayTimezone}
      >
        Display TZ
      </button>
    </div>
  );
}
