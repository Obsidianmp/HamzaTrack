import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { resumeTimer } from "@/lib/service";
import { jsonError } from "@/app/api/_utils";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const timer = await resumeTimer(user);
    return NextResponse.json({ ok: true, timer });
  } catch (error) {
    return jsonError(error, 400);
  }
}
