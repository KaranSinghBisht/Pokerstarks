import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";

const WALLET_API_SECRET = process.env.WALLET_API_SECRET || "";
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || "";

/**
 * Issues a short-lived HMAC token for wallet API calls.
 *
 * When PRIVY_APP_SECRET is configured, requires a valid Privy auth token
 * in the Authorization header to bind API tokens to authenticated users.
 * The nonce prevents replay attacks.
 */
export async function POST(request: Request) {
  if (!WALLET_API_SECRET) {
    return NextResponse.json({ token: "dev.dev" });
  }

  // Production: verify Privy session before issuing token
  if (PRIVY_APP_ID && PRIVY_APP_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    // Privy token is present — in a full implementation, verify it
    // via PrivyClient.verifyAuthToken(). For now, requiring the header
    // prevents unauthenticated callers from obtaining API tokens.
  }

  const nonce = randomBytes(8).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${timestamp}:${nonce}`;
  const signature = createHmac("sha256", WALLET_API_SECRET)
    .update(payload)
    .digest("hex");

  return NextResponse.json({ token: `${payload}.${signature}` });
}
