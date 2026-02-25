import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { updateEntry } from "@/lib/service";
import { jsonError } from "@/app/api/_utils";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await context.params;
    const payload = (await request.json()) as {
      startAtUtc?: string;
      endAtUtc?: string;
      notes?: string;
    };
    const entry = await updateEntry(user, id, payload);
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return jsonError(error, 400);
  }
}
