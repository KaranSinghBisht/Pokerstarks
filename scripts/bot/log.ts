/**
 * Colored console logging for the bot.
 */

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

export const log = {
  info(msg: string) {
    console.log(`${DIM}${timestamp()}${RESET} ${CYAN}[bot]${RESET} ${msg}`);
  },
  action(msg: string) {
    console.log(`${DIM}${timestamp()}${RESET} ${GREEN}[act]${RESET} ${BOLD}${msg}${RESET}`);
  },
  phase(msg: string) {
    console.log(`${DIM}${timestamp()}${RESET} ${YELLOW}[phase]${RESET} ${BOLD}${msg}${RESET}`);
  },
  tx(entrypoint: string, hash: string) {
    console.log(
      `${DIM}${timestamp()}${RESET} ${GREEN}[tx]${RESET} ${entrypoint} → ${DIM}${hash.slice(0, 18)}...${RESET}`,
    );
  },
  error(msg: string) {
    console.error(`${DIM}${timestamp()}${RESET} ${RED}[err]${RESET} ${msg}`);
  },
  warn(msg: string) {
    console.warn(`${DIM}${timestamp()}${RESET} ${YELLOW}[warn]${RESET} ${msg}`);
  },
  debug(msg: string) {
    if (process.env.BOT_DEBUG) {
      console.log(`${DIM}${timestamp()} [dbg] ${msg}${RESET}`);
    }
  },
};
