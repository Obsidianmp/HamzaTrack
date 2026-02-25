import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { appendAuditLog, updateDb } from "@/lib/db";

export async function POST() {
  const user = await getSessionUser();
  if (user) {
    await updateDb((db) => {
      appendAuditLog(db, {
        actorId: user.id,
        action: "logout",
        targetType: "auth",
        targetId: user.id
      });
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("tt_session_user_id");
  return response;
}
