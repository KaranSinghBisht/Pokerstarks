/**
 * BotManager — singleton that manages active bot instances.
 *
 * Each table can have multiple bots. Bots are keyed by `${tableId}-${seatIndex}`.
 */

import { PokerBot, type BotConfig } from "./bot";
import { getBotAccountPool, type BotAccount } from "./accounts";
import { StateReader } from "./state";
import { log } from "./log";

const activeBots = new Map<string, PokerBot>();

function botKey(tableId: number, seatIndex: number): string {
  return `${tableId}-${seatIndex}`;
}

export interface SpawnResult {
  success: boolean;
  address?: string;
  seatIndex?: number;
  error?: string;
}

export interface FillResult {
  spawned: SpawnResult[];
  error?: string;
}

export interface BotStatus {
  tableId: number;
  seatIndex: number;
  address: string;
  stopped: boolean;
}

/**
 * Spawn a single bot at a specific seat.
 */
export function spawnBot(
  tableId: number,
  seatIndex: number,
  account: BotAccount,
  options?: {
    strategy?: BotConfig["strategy"];
    buyIn?: bigint;
    pollMs?: number;
  },
): SpawnResult {
  const key = botKey(tableId, seatIndex);
  if (activeBots.has(key)) {
    return {
      success: false,
      error: `Bot already active at table ${tableId} seat ${seatIndex}`,
    };
  }

  const config: BotConfig = {
    tableId,
    seatIndex,
    strategy: options?.strategy ?? "passive",
    buyIn: options?.buyIn ?? 0n,
    privateKey: account.privateKey,
    address: account.address,
    pollMs: options?.pollMs ?? 2000,
  };

  const bot = new PokerBot(config);
  activeBots.set(key, bot);
  bot.start();

  return {
    success: true,
    address: account.address,
    seatIndex,
  };
}

/**
 * Fill all empty seats at a table with bots.
 */
export async function fillWithBots(
  tableId: number,
  options?: {
    strategy?: BotConfig["strategy"];
    buyIn?: bigint;
    pollMs?: number;
  },
): Promise<FillResult> {
  const pool = getBotAccountPool();
  if (pool.length === 0) {
    return {
      spawned: [],
      error:
        "No bot accounts configured. Set BOT_PRIVATE_KEY_1..4 and BOT_ADDRESS_1..4 env vars.",
    };
  }

  // Poll current state to find empty seats
  const stateReader = new StateReader();
  const gs = await stateReader.poll(tableId);

  if (!gs.table) {
    return { spawned: [], error: `Table ${tableId} not found` };
  }

  // Find occupied seats and addresses (including existing bots)
  const occupiedSeats = new Set(
    gs.seats.filter((s) => s.isOccupied).map((s) => s.seatIndex),
  );
  const occupiedAddresses = new Set(
    gs.seats
      .filter((s) => s.isOccupied)
      .map((s) => s.player.toLowerCase()),
  );

  // Also skip seats/addresses that already have active bots
  for (const bot of activeBots.values()) {
    if (bot.tableId === tableId) {
      occupiedSeats.add(bot.seatIndex);
      occupiedAddresses.add(bot.address.toLowerCase());
    }
  }

  // Find empty seats
  const emptySeats: number[] = [];
  for (let i = 0; i < gs.table.maxPlayers; i++) {
    if (!occupiedSeats.has(i)) {
      emptySeats.push(i);
    }
  }

  if (emptySeats.length === 0) {
    return { spawned: [], error: "No empty seats available" };
  }

  // Filter pool to accounts not already seated
  const availableAccounts = pool.filter(
    (a) => !occupiedAddresses.has(a.address.toLowerCase()),
  );

  if (availableAccounts.length === 0) {
    return {
      spawned: [],
      error: "All bot accounts are already seated at this table",
    };
  }

  const count = Math.min(emptySeats.length, availableAccounts.length);
  const results: SpawnResult[] = [];

  for (let i = 0; i < count; i++) {
    const result = spawnBot(tableId, emptySeats[i], availableAccounts[i], options);
    results.push(result);
  }

  log.info(
    `Filled ${results.filter((r) => r.success).length} bots at table ${tableId}`,
  );

  return { spawned: results };
}

/**
 * Stop all bots at a table.
 */
export function stopBotsAtTable(tableId: number): number {
  let stopped = 0;
  for (const [key, bot] of activeBots) {
    if (bot.tableId === tableId) {
      bot.stop();
      activeBots.delete(key);
      stopped++;
    }
  }
  return stopped;
}

/**
 * Get status of all bots at a table.
 */
export function getBotsAtTable(tableId: number): BotStatus[] {
  const result: BotStatus[] = [];
  for (const bot of activeBots.values()) {
    if (bot.tableId === tableId) {
      result.push({
        tableId: bot.tableId,
        seatIndex: bot.seatIndex,
        address: bot.address,
        stopped: bot.stopped,
      });
    }
  }
  return result;
}

/**
 * Stop all bots globally.
 */
export function stopAllBots(): number {
  let stopped = 0;
  for (const [key, bot] of activeBots) {
    bot.stop();
    activeBots.delete(key);
    stopped++;
  }
  return stopped;
}
