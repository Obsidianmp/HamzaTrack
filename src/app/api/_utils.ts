import { NextResponse } from "next/server";

export function jsonError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return new NextResponse(message, { status });
}
