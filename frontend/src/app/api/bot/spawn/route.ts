import { NextResponse } from "next/server";
import { spawnBot } from "@/lib/bot/manager";
import { getBotAccountPool } from "@/lib/bot/accounts";
import { isAllowedBotRequest } from "@/lib/bot/auth";

export async function POST(request: Request) {
  if (!isAllowedBotRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const tableId = Number(body.tableId);
    const seatIndex = Number(body.seatIndex);
    const accountIndex = Number(body.accountIndex ?? 0);

    if (tableId === undefined || tableId === null || isNaN(tableId)) {
      return NextResponse.json(
        { error: "Missing or invalid tableId" },
        { status: 400 },
      );
    }
    if (isNaN(seatIndex) || seatIndex < 0 || seatIndex > 5) {
      return NextResponse.json(
        { error: "Missing or invalid seatIndex (0-5)" },
        { status: 400 },
      );
    }

    const pool = getBotAccountPool();
    if (accountIndex >= pool.length) {
      return NextResponse.json(
        {
          error: `Bot account ${accountIndex} not configured. Only ${pool.length} accounts available.`,
        },
        { status: 400 },
      );
    }

    const result = spawnBot(tableId, seatIndex, pool[accountIndex], {
      strategy: body.strategy ?? "passive",
      buyIn: body.buyIn ? BigInt(body.buyIn) : undefined,
      pollMs: Math.max(500, Math.min(30000, Number(body.pollMs) || 2000)),
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
