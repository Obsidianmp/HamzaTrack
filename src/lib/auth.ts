import "server-only";

import { cookies } from "next/headers";

import { readDb } from "@/lib/db";
import type { Role, User } from "@/types/time-tracker";

export const SESSION_COOKIE = "tt_session_user_id";

export async function getSessionUserId() {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function getSessionUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await readDb();
  return db.users.find((user) => user.id === userId) ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== role) {
    throw new Error("Forbidden");
  }
  return user;
}
