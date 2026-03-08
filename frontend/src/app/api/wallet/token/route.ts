import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";

const WALLET_API_SECRET = process.env.WALLET_API_SECRET || "";

/**
 * Issues a short-lived HMAC token for wallet API calls.
 *
 * Token format: `<timestamp>:<nonce>.<hmac>` — nonce prevents replay.
 * When WALLET_API_SECRET is not set (dev/demo), returns a dummy token
 * that _auth.ts will skip.
 *
 * In production, set WALLET_API_SECRET to a strong random secret.
 * For full identity binding, add Privy verifyAuthToken() here
 * once the onboarding flow passes the Privy session token.
 */
export async function POST() {
  if (!WALLET_API_SECRET) {
    return NextResponse.json({ token: "dev.dev" });
  }

  const nonce = randomBytes(8).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${timestamp}:${nonce}`;
  const signature = createHmac("sha256", WALLET_API_SECRET)
    .update(payload)
    .digest("hex");

  return NextResponse.json({ token: `${payload}.${signature}` });
}
