import { NextResponse } from "next/server";
import { fillWithBots } from "@/lib/bot/manager";
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

    const result = await fillWithBots(tableId, {
      strategy: body.strategy ?? "passive",
      buyIn: body.buyIn ? BigInt(body.buyIn) : undefined,
      pollMs: Math.max(500, Math.min(30000, Number(body.pollMs) || 2000)),
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
