import { NextResponse } from "next/server";

import { jsonError } from "@/app/api/_utils";
import { getSessionUser } from "@/lib/auth";
import { dashboardReportToCsv } from "@/lib/csv";
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
    const data = await loadDashboard(user, preset, timezone);
    const csv = dashboardReportToCsv(data);

    const filename = `hamzatrack-report-${preset}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
