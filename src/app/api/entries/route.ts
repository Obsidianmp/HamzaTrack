import { NextResponse } from "next/server";

import { jsonError } from "@/app/api/_utils";
import { getSessionUser } from "@/lib/auth";
import { createManualEntry } from "@/lib/service";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const payload = (await request.json()) as {
      startAtUtc?: string;
      endAtUtc?: string;
      notes?: string;
    };
    const entry = await createManualEntry(user, payload);
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return jsonError(error, 400);
  }
}
