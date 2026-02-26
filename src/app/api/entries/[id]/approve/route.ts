import { NextResponse } from "next/server";

import { jsonError } from "@/app/api/_utils";
import { getSessionUser } from "@/lib/auth";
import { setEntryApproval } from "@/lib/service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await context.params;
    const payload = (await request.json()) as { approvedForPayout?: boolean };
    if (typeof payload.approvedForPayout !== "boolean") {
      throw new Error("approvedForPayout must be true or false");
    }
    const entry = await setEntryApproval(user, id, payload.approvedForPayout);
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return jsonError(error, 400);
  }
}
