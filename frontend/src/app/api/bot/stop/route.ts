import { NextResponse } from "next/server";
import { stopBotsAtTable } from "@/lib/bot/manager";
import { isAllowedBotRequest } from "@/lib/bot/auth";

export async function POST(request: Request) {
  if (!isAllowedBotRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const tableId = Number(body.tableId);

    if (tableId === undefined || tableId === null || isNaN(tableId)) {
      return NextResponse.json(
        { error: "Missing or invalid tableId" },
        { status: 400 },
      );
    }

    const stopped = stopBotsAtTable(tableId);
    return NextResponse.json({ stopped });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
