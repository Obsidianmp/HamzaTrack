import { NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth";
import { readDb } from "@/lib/db";

export async function GET() {
  const db = await readDb();
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? db.users.find((item) => item.id === sessionUserId) ?? null : null;
  return NextResponse.json({
    user,
    users: db.users
  });
}
