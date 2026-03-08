import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";

const WALLET_API_SECRET = process.env.WALLET_API_SECRET || "";
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || "";

/**
 * Issues a short-lived HMAC token for wallet API calls.
 *
 * Token format: `<timestamp>:<nonce>.<hmac>` — nonce prevents replay.
 * When WALLET_API_SECRET is not set (dev/demo), returns a dummy token
 * that _auth.ts will skip.
 *
 * When Privy credentials are configured, the endpoint verifies the
 * caller's Privy session token (Authorization header) before issuing.
 * If Privy is not configured, tokens are issued without identity
 * binding (acceptable for hackathon / StarkZap onboarding flow).
 */
export async function POST(req: NextRequest) {
  if (!WALLET_API_SECRET) {
    return NextResponse.json({ token: "dev.dev" });
  }

  // If Privy credentials are configured, require + verify session token
  if (PRIVY_APP_ID && PRIVY_APP_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "missing session token" }, { status: 401 });
    }
    const sessionToken = authHeader.slice(7);
    const valid = await verifyPrivyToken(sessionToken);
    if (!valid) {
      return NextResponse.json({ error: "invalid session" }, { status: 403 });
    }
  }

  const nonce = randomBytes(8).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${timestamp}:${nonce}`;
  const signature = createHmac("sha256", WALLET_API_SECRET)
    .update(payload)
    .digest("hex");

  return NextResponse.json({ token: `${payload}.${signature}` });
}

/**
 * Verify a Privy access token via their /api/v1/token/verify endpoint.
 * Returns true if valid, false otherwise.
 */
async function verifyPrivyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("https://auth.privy.io/api/v1/token/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": PRIVY_APP_ID,
        Authorization: `Basic ${Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString("base64")}`,
      },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
