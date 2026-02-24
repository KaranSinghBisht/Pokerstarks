import { NextResponse } from "next/server";
import { getBotsAtTable } from "@/lib/bot/manager";
import { isAllowedBotRequest } from "@/lib/bot/auth";

export async function GET(request: Request) {
  if (!isAllowedBotRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tableId = Number(searchParams.get("tableId"));

  if (!tableId || isNaN(tableId)) {
    return NextResponse.json(
      { error: "Missing or invalid tableId query param" },
      { status: 400 },
    );
  }

  const bots = getBotsAtTable(tableId);
  return NextResponse.json({ bots });
}
