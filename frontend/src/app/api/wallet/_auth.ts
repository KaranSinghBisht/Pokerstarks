import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const WALLET_API_SECRET = process.env.WALLET_API_SECRET || "";
const TOKEN_MAX_AGE_MS = 60_000; // 60 seconds

/**
 * Verify the X-API-Token header for wallet API endpoints.
 *
 * Token format: `<timestamp>.<hmac-sha256(timestamp, secret)>`
 *
 * Returns null if valid, or a NextResponse error if invalid.
 * When WALLET_API_SECRET is not set (dev mode), auth is skipped.
 */
export function verifyApiToken(request: Request): NextResponse | null {
  // Skip auth in dev when secret is not configured
  if (!WALLET_API_SECRET) return null;

  const token = request.headers.get("x-api-token");
  if (!token) {
    return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
  }

  // Token format: "<timestamp>:<nonce>.<hmac>" or legacy "<timestamp>.<hmac>"
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) {
    return NextResponse.json({ error: "Malformed authentication token" }, { status: 401 });
  }

  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  // Extract timestamp (first part before any colon)
  const colonIndex = payload.indexOf(":");
  const timestamp = colonIndex >= 0 ? payload.slice(0, colonIndex) : payload;

  // Validate timestamp is a number and within acceptable age
  const ts = Number(timestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > TOKEN_MAX_AGE_MS) {
    return NextResponse.json({ error: "Token expired" }, { status: 401 });
  }

  // Compute expected HMAC over the full payload (timestamp:nonce)
  const expected = createHmac("sha256", WALLET_API_SECRET)
    .update(payload)
    .digest("hex");

  // Constant-time comparison
  try {
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json({ error: "Invalid authentication token" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid authentication token" }, { status: 401 });
  }

  return null;
}

/**
 * Generate an API token for client-side use.
 * Called only from the StarkZap onboarding flow on the client.
 */
export function generateApiToken(secret: string): string {
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret).update(timestamp).digest("hex");
  return `${timestamp}.${signature}`;
}
