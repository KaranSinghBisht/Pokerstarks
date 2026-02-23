import { NextResponse } from "next/server";
import { fillWithBots } from "@/lib/bot/manager";

const BOT_API_SECRET = process.env.BOT_API_SECRET || process.env.NEXT_PUBLIC_BOT_API_SECRET;

function isAuthorized(request: Request): boolean {
  if (!BOT_API_SECRET) return true; // No secret configured → open (dev mode)
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

    const result = await fillWithBots(tableId, {
      strategy: body.strategy ?? "passive",
      buyIn: body.buyIn ? BigInt(body.buyIn) : undefined,
      pollMs: body.pollMs ?? 2000,
    });

    return NextResponse.json({
      spawned: result.spawned.map((s) => ({
        success: s.success,
        address: s.address,
        seatIndex: s.seatIndex,
        error: s.error,
      })),
      error: result.error,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
