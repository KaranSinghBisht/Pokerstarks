/**
 * Re-export shared crypto utilities from the frontend codebase.
 *
 * Uses a single barrel import to avoid CJS/ESM diamond dependency
 * cycles that occur when importing multiple frontend modules that
 * share common dependencies (elgamal.ts).
 */

const cryptoModule = await import("../../frontend/src/lib/crypto-exports.ts");

export type Point = import("../../frontend/src/lib/cards/elgamal.ts").Point;

export const computeAggregateKey = cryptoModule.computeAggregateKey;
export const MentalPokerSession = cryptoModule.MentalPokerSession;
export const serializeDeck = cryptoModule.serializeDeck;
export const deserializeDeck = cryptoModule.deserializeDeck;
