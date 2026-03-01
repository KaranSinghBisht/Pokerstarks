/**
 * Bot API route authentication.
 *
 * - When BOT_API_SECRET is set, callers must provide it as a Bearer token.
 * - When BOT_API_SECRET is not set (dev mode), all requests are allowed.
 *
 * Browser-facing buttons (solo mode, fill-with-bots) work in dev mode.
 * In production, set BOT_API_SECRET and call bot routes from server-side
 * scripts only.
 */

const BOT_API_SECRET = process.env.BOT_API_SECRET; // server-only, no NEXT_PUBLIC_

export function isAllowedBotRequest(request: Request): boolean {
  // Dev mode: no secret configured → allow everything
  if (!BOT_API_SECRET) {
    console.warn("[bot-auth] BOT_API_SECRET is not set — bot API is open to all requests. Set it in production.");
    return true;
  }

  // Require bearer token
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${BOT_API_SECRET}`;
}
