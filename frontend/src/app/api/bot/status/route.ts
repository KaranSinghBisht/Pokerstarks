import { NextResponse } from "next/server";
import { getBotsAtTable } from "@/lib/bot/manager";

const BOT_API_SECRET = process.env.BOT_API_SECRET || process.env.NEXT_PUBLIC_BOT_API_SECRET;

function isAuthorized(request: Request): boolean {
  if (!BOT_API_SECRET) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${BOT_API_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
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
