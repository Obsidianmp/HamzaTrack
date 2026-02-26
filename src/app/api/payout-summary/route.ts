import { NextResponse } from "next/server";

import { jsonError } from "@/app/api/_utils";
import { getSessionUser } from "@/lib/auth";
import { loadPayoutSummary } from "@/lib/service";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    const summary = await loadPayoutSummary(user, month);
    return NextResponse.json(summary);
  } catch (error) {
    return jsonError(error, 400);
  }
}
