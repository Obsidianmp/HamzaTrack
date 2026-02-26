import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { loadDashboard } from "@/lib/service";
import type { PeriodPreset } from "@/types/time-tracker";
import { jsonError } from "@/app/api/_utils";

const VALID_PRESETS = new Set<PeriodPreset>(["daily", "weekly", "monthly", "mtd", "ytd"]);

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const url = new URL(request.url);
    const presetParam = (url.searchParams.get("preset") ?? "mtd") as PeriodPreset;
    const preset = VALID_PRESETS.has(presetParam) ? presetParam : "mtd";
    const timezone = url.searchParams.get("timezone");
    const day = url.searchParams.get("day");
    const data = await loadDashboard(user, preset, timezone, day);
    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error, 400);
  }
}
