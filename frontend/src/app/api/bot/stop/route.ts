import { NextResponse } from "next/server";
import { stopBotsAtTable } from "@/lib/bot/manager";

const BOT_API_SECRET = process.env.BOT_API_SECRET || process.env.NEXT_PUBLIC_BOT_API_SECRET;

function isAuthorized(request: Request): boolean {
  if (!BOT_API_SECRET) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${BOT_API_SECRET}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const tableId = Number(body.tableId);

    if (!tableId || isNaN(tableId)) {
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
