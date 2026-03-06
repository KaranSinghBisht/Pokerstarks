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

export async function POST() {
  try {
    const privy = getPrivyClient();

    // Create a server-managed Starknet wallet
    const wallet = await privy.wallets().create({
      chain_type: "starknet",
    });

    return NextResponse.json({
      wallet: {
        id: wallet.id,
        address: wallet.address,
        publicKey: wallet.public_key ?? "",
      },
    });
  } catch (err) {
    console.error("[api/wallet/starknet] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Wallet creation failed" },
      { status: 500 },
    );
  }
}
