import { NextResponse } from "next/server";

import { jsonError } from "@/app/api/_utils";
import { getSessionUser } from "@/lib/auth";
import { dashboardReportToPdf } from "@/lib/pdf";
import { loadDashboard } from "@/lib/service";
import type { PeriodPreset } from "@/types/time-tracker";

const VALID_PRESETS = new Set<PeriodPreset>(["daily", "weekly", "monthly", "mtd", "ytd"]);

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const url = new URL(request.url);
    const presetParam = (url.searchParams.get("preset") ?? "mtd") as PeriodPreset;
    const preset = VALID_PRESETS.has(presetParam) ? presetParam : "mtd";
    const timezone = url.searchParams.get("timezone");
    const timezoneMode = url.searchParams.get("timezoneMode") as "billing" | "display" | null;
    const day = url.searchParams.get("day");
    const data = await loadDashboard(user, preset, timezone, day, timezoneMode);
    const pdf = dashboardReportToPdf(data);

    const filename = `hamzatrack-report-${preset}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
