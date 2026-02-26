"use client";

import { useEffect, useState, useTransition } from "react";

import { getJson } from "@/lib/client-api";

type SettingsResponse = {
  contractor: {
    id: string;
    name: string;
    timezone: string;
  };
  contract: {
    hourlyRate: number;
    currency: string;
  };
  users: Array<{
    id: string;
    role: "admin" | "contractor";
    timezone: string;
  }>;
  appSettings?: {
    billingTimezone?: string;
  };
};

export function SettingsForm() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [hourlyRate, setHourlyRate] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [contractorTimezone, setContractorTimezone] = useState("UTC");
  const [adminTimezone, setAdminTimezone] = useState("UTC");
  const [billingTimezone, setBillingTimezone] = useState("America/New_York");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void getJson<SettingsResponse>("/api/settings")
      .then((response) => {
        setData(response);
        setHourlyRate(String(response.contract.hourlyRate));
        setCurrency(response.contract.currency);
        setContractorTimezone(response.contractor.timezone);
        const admin = response.users.find((user) => user.role === "admin");
        setAdminTimezone(admin?.timezone ?? "UTC");
        setBillingTimezone(response.appSettings?.billingTimezone ?? "America/New_York");
      })
      .catch((err) => setError(err.message));
  }, []);

  function onSave(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        const response = await getJson<SettingsResponse>("/api/settings", {
          method: "PATCH",
          body: JSON.stringify({
            hourlyRate: Number(hourlyRate),
            currency,
            contractorTimezone,
            adminTimezone
          })
        });
        setData(response);
        setMessage("Settings saved.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <div className="panel pad" style={{ maxWidth: 720 }}>
      <form className="stack" onSubmit={onSave}>
        <div>
          <h1 className="heading">Settings</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Single-contractor MVP settings (rate, currency, and timezones).
          </p>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="hourlyRate">Hourly Rate</label>
            <input
              id="hourlyRate"
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="currency">Currency</label>
            <input
              id="currency"
              className="input"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              required
            />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="billingTimezone">Billing Timezone (fixed)</label>
            <input id="billingTimezone" className="input" value={billingTimezone} readOnly />
          </div>
          <div className="field">
            <label htmlFor="contractorTimezone">Contractor Timezone (IANA)</label>
            <input
              id="contractorTimezone"
              className="input"
              value={contractorTimezone}
              onChange={(e) => setContractorTimezone(e.target.value)}
              placeholder="Asia/Manila"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="adminTimezone">Admin Timezone (IANA)</label>
            <input
              id="adminTimezone"
              className="input"
              value={adminTimezone}
              onChange={(e) => setAdminTimezone(e.target.value)}
              placeholder="America/New_York"
              required
            />
          </div>
        </div>

        <div className="warning-banner" style={{ fontSize: 13 }}>
          Rate changes apply to new entries going forward only. Existing entries keep their stored rate snapshot and billable amount.
        </div>
        <div className="warning-banner" style={{ fontSize: 13 }}>
          Changing user timezones only changes display/report views in &quot;Display TZ&quot; mode. Stored timestamps remain in UTC, so historical data is not rewritten.
        </div>

        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="success">{message}</div> : null}

        <div className="row">
          <button className="btn primary" type="submit" disabled={pending || !data}>
            {pending ? "Saving..." : "Save Settings"}
          </button>
          {data ? (
            <div className="muted" style={{ fontSize: 13 }}>
              Contractor: {data.contractor.name}
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}
