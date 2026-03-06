import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

function getPrivyClient(): PrivyClient {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error("Privy credentials not configured");
  }
  return new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
}

export async function POST(request: Request) {
  try {
    const { walletId, hash } = await request.json();

    if (!walletId || !hash) {
      return NextResponse.json(
        { error: "walletId and hash are required" },
        { status: 400 },
      );
    }

    const privy = getPrivyClient();

    // rawSign expects { params: { hash } } — hash must start with "0x"
    const result = await privy.wallets().rawSign(walletId, {
      params: { hash },
    });

    return NextResponse.json({ signature: result.signature });
  } catch (err) {
    console.error("[api/wallet/sign] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Signing failed" },
      { status: 500 },
    );
  }
}
