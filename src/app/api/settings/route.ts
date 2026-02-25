import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { loadSettings, updateSettings } from "@/lib/service";
import { jsonError } from "@/app/api/_utils";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const data = await loadSettings(user);
    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error, 403);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const payload = (await request.json()) as {
      hourlyRate?: number;
      currency?: string;
      contractorTimezone?: string;
      adminTimezone?: string;
    };
    const data = await updateSettings(user, payload);
    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error, 400);
  }
}
