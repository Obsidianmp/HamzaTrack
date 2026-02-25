import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { stopTimer } from "@/lib/service";
import { jsonError } from "@/app/api/_utils";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const entry = await stopTimer(user);
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return jsonError(error, 400);
  }
}
