/**
 * Server-side logging for bots.
 * Stripped of ANSI colors for Next.js server logs.
 */

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

export const log = {
  info(msg: string) {
    console.log(`${timestamp()} [bot] ${msg}`);
  },
  action(msg: string) {
    console.log(`${timestamp()} [act] ${msg}`);
  },
  phase(msg: string) {
    console.log(`${timestamp()} [phase] ${msg}`);
  },
  tx(entrypoint: string, hash: string) {
    console.log(`${timestamp()} [tx] ${entrypoint} → ${hash.slice(0, 18)}...`);
  },
  error(msg: string) {
    console.error(`${timestamp()} [err] ${msg}`);
  },
  warn(msg: string) {
    console.warn(`${timestamp()} [warn] ${msg}`);
  },
};
