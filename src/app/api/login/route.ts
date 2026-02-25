import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth";
import { appendAuditLog, readDb, updateDb } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json()) as { userId?: string };
  if (!body.userId) {
    return new NextResponse("userId is required", { status: 400 });
  }

  const db = await readDb();
  const user = db.users.find((item) => item.id === body.userId);
  if (!user) {
    return new NextResponse("User not found", { status: 404 });
  }

  await updateDb((mutableDb) => {
    appendAuditLog(mutableDb, {
      actorId: user.id,
      action: "login",
      targetType: "auth",
      targetId: user.id,
      metadata: { via: "demo-selector" }
    });
  });

  const response = NextResponse.json({ ok: true, user });
  response.cookies.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}
