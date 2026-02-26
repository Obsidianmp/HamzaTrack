import type { DashboardResponse, PeriodPreset, TrackerDb } from "@/types/time-tracker";

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function dashboardUrl(
  preset: PeriodPreset,
  timezone?: string,
  day?: string,
  timezoneMode?: "billing" | "display"
) {
  const params = new URLSearchParams({ preset });
  if (timezone) params.set("timezone", timezone);
  if (day) params.set("day", day);
  if (timezoneMode) params.set("timezoneMode", timezoneMode);
  return `/api/dashboard?${params.toString()}`;
}

export function reportUrl(
  preset: PeriodPreset,
  timezone?: string,
  day?: string,
  timezoneMode?: "billing" | "display"
) {
  const params = new URLSearchParams({ preset });
  if (timezone) params.set("timezone", timezone);
  if (day) params.set("day", day);
  if (timezoneMode) params.set("timezoneMode", timezoneMode);
  return `/api/reports?${params.toString()}`;
}

export function reportPdfUrl(
  preset: PeriodPreset,
  timezone?: string,
  day?: string,
  timezoneMode?: "billing" | "display"
) {
  const params = new URLSearchParams({ preset });
  if (timezone) params.set("timezone", timezone);
  if (day) params.set("day", day);
  if (timezoneMode) params.set("timezoneMode", timezoneMode);
  return `/api/reports/pdf?${params.toString()}`;
}

export type SessionResponse = {
  user: DashboardResponse["currentUser"] | null;
  users: TrackerDb["users"];
};
