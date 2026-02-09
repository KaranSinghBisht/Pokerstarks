/**
 * Card encoding: maps card IDs (0-51) to elliptic curve points and back.
 *
 * Card ID layout (standard 52-card deck):
 *   id = rank * 4 + suit
 *   rank: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
 *   suit: 0=clubs, 1=diamonds, 2=hearts, 3=spades
 *
 * Curve point mapping: M_id = (id + 1) * G
 * This gives each card a unique, publicly known point on the Grumpkin curve.
 * The +1 ensures card 0 maps to 1*G (not the point at infinity).
 */

import { GENERATOR, scalarMul, type Point } from "./elgamal";

// ───────────────────── Precomputed Card Points ─────────────────────

/**
 * Lookup table: CARD_POINTS[i] = (i + 1) * G for i in 0..51
 * Precomputed once at module load for fast encoding/decoding.
 */
export const CARD_POINTS: Point[] = [];

/**
 * Reverse lookup: maps point (x,y) coordinates to card ID.
 * Uses both coordinates to eliminate P/-P ambiguity on the curve.
 */
const POINT_TO_CARD_ID: Map<string, number> = new Map();

// Precompute all 52 card points
for (let i = 0; i < 52; i++) {
  const point = scalarMul(GENERATOR, BigInt(i + 1))!;
  CARD_POINTS.push(point);
  POINT_TO_CARD_ID.set(`${point.x.toString()},${point.y.toString()}`, i);
}

// ───────────────────── Encoding Functions ─────────────────────

/** Map a card ID (0-51) to its curve point: (id + 1) * G */
export function cardIdToPoint(cardId: number): Point {
  if (cardId < 0 || cardId >= 52) {
    throw new Error(`Invalid card ID: ${cardId}`);
  }
  return CARD_POINTS[cardId];
}

/**
 * Map a decrypted curve point back to a card ID.
 * Returns -1 if the point doesn't match any known card.
 */
export function pointToCardId(point: Point): number {
  const key = `${point.x.toString()},${point.y.toString()}`;
  const id = POINT_TO_CARD_ID.get(key);
  return id !== undefined ? id : -1;
}

// ───────────────────── Card Display Helpers ─────────────────────

const RANKS = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
] as const;

const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
const SUIT_SYMBOLS = ["♣", "♦", "♥", "♠"] as const;

export function cardIdToRank(cardId: number): string {
  return RANKS[Math.floor(cardId / 4)];
}

export function cardIdToSuit(cardId: number): string {
  return SUITS[cardId % 4];
}

export function cardIdToSuitSymbol(cardId: number): string {
  return SUIT_SYMBOLS[cardId % 4];
}

export function cardIdToDisplay(cardId: number): string {
  return `${cardIdToRank(cardId)}${cardIdToSuitSymbol(cardId)}`;
}
