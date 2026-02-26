import { NextResponse } from "next/server";

import { jsonError } from "@/app/api/_utils";
import { getSessionUser } from "@/lib/auth";
import { exportBackupPayload } from "@/lib/service";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const payload = await exportBackupPayload(user);
    const filename = `hamzatrack-backup-${payload.scope}-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
