import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { verifyApiToken } from "../_auth";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

function getPrivyClient(): PrivyClient {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error("Privy credentials not configured");
  }
  return new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
}

export async function POST(request: Request) {
  const authError = verifyApiToken(request);
  if (authError) return authError;

  try {
    const { walletId, hash } = await request.json();

    if (!walletId || !hash) {
      return NextResponse.json(
        { error: "walletId and hash are required" },
        { status: 400 },
      );
    }

    // Validate hash format: must be 0x-prefixed hex, max 252 bits (felt252)
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{1,63}$/.test(hash)) {
      return NextResponse.json(
        { error: "Invalid hash format" },
        { status: 400 },
      );
    }

    const privy = getPrivyClient();

    const result = await privy.wallets().rawSign(walletId, {
      params: { hash },
    });

    return NextResponse.json({ signature: result.signature });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Signing failed" },
      { status: 500 },
    );
  }
}
