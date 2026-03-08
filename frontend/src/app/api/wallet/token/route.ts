import { NextResponse } from "next/server";
import { createHmac } from "crypto";

const WALLET_API_SECRET = process.env.WALLET_API_SECRET || "";

/**
 * Issues a short-lived HMAC token for wallet API calls.
 *
 * Security: This endpoint itself is rate-limited by the hosting platform
 * and only useful with a valid WALLET_API_SECRET. The issued token expires
 * in 60 seconds, limiting the abuse window.
 *
 * In production, add Privy session verification here to bind tokens
 * to authenticated users.
 */
export async function POST() {
  if (!WALLET_API_SECRET) {
    // Dev mode — return a dummy token that _auth.ts will skip
    return NextResponse.json({ token: "dev.dev" });
  }

  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", WALLET_API_SECRET)
    .update(timestamp)
    .digest("hex");

  return NextResponse.json({ token: `${timestamp}.${signature}` });
}
