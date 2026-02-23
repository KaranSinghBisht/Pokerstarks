/**
 * Bot account pool — reads from server-only env vars.
 *
 * Each bot needs a funded Starknet account.
 * Set BOT_PRIVATE_KEY_1..BOT_PRIVATE_KEY_4 and BOT_ADDRESS_1..BOT_ADDRESS_4.
 */

export interface BotAccount {
  privateKey: string;
  address: string;
}

const MAX_BOTS = 4;

let _pool: BotAccount[] | null = null;

export function getBotAccountPool(): BotAccount[] {
  if (_pool) return _pool;

  _pool = [];
  for (let i = 1; i <= MAX_BOTS; i++) {
    const privateKey = process.env[`BOT_PRIVATE_KEY_${i}`];
    const address = process.env[`BOT_ADDRESS_${i}`];
    if (privateKey && address) {
      _pool.push({ privateKey, address });
    }
  }
  return _pool;
}

export function getAvailableBotCount(): number {
  return getBotAccountPool().length;
}
