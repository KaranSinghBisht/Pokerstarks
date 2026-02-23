// ─── Tongo Confidential Token Addresses (Sepolia) ───
export const TONGO_STRK_ADDRESS =
  process.env.NEXT_PUBLIC_TONGO_STRK_ADDRESS ||
  "0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed";

export const STRK_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_STRK_TOKEN_ADDRESS ||
  "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// ─── CHIP Token (ERC20, decimals=0) ───
export const CHIP_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_CHIP_TOKEN_ADDRESS || "";

// Tongo STRK rate: 1 Tongo unit = rate wei of STRK
// For Sepolia STRK instance: rate = 5e16, so 1 Tongo unit = 0.05 STRK
export const TONGO_STRK_RATE = 50000000000000000n;

// localStorage key for the persisted Tongo private key
export const TONGO_KEY_STORAGE_PREFIX = "pokerstarks.tongo.v1";

// Game phases matching Cairo GamePhase enum
export enum GamePhase {
  Setup = "Setup",
  Shuffling = "Shuffling",
  DealingPreflop = "DealingPreflop",
  BettingPreflop = "BettingPreflop",
  DealingFlop = "DealingFlop",
  BettingFlop = "BettingFlop",
  DealingTurn = "DealingTurn",
  BettingTurn = "BettingTurn",
  DealingRiver = "DealingRiver",
  BettingRiver = "BettingRiver",
  Showdown = "Showdown",
  Settling = "Settling",
}

export enum PlayerAction {
  Fold = 0,
  Check = 1,
  Call = 2,
  Bet = 3,
  Raise = 4,
  AllIn = 5,
}

// Card encoding: rank * 4 + suit
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS = ["♣", "♦", "♥", "♠"];
export const SUIT_COLORS: Record<string, string> = {
  "♣": "text-gray-900",
  "♦": "text-red-500",
  "♥": "text-red-500",
  "♠": "text-gray-900",
};

export function cardIdToRank(id: number): string {
  return RANKS[Math.floor(id / 4)];
}

export function cardIdToSuit(id: number): string {
  return SUITS[id % 4];
}

export function cardIdToString(id: number): string {
  if (id === 255) return "??";
  return `${cardIdToRank(id)}${cardIdToSuit(id)}`;
}
