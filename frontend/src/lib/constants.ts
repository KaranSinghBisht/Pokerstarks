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
