import { createRequire } from "module";

const require = createRequire(import.meta.url);

const elgamalModule = require("../../frontend/src/lib/cards/elgamal.ts") as {
  computeAggregateKey: typeof import("../../frontend/src/lib/cards/elgamal.ts").computeAggregateKey;
};

const mentalPokerModule = require("../../frontend/src/lib/cards/mental-poker.ts") as {
  MentalPokerSession: typeof import("../../frontend/src/lib/cards/mental-poker.ts").MentalPokerSession;
};

const shuffleModule = require("../../frontend/src/lib/noir/shuffle.ts") as {
  serializeDeck: typeof import("../../frontend/src/lib/noir/shuffle.ts").serializeDeck;
  deserializeDeck: typeof import("../../frontend/src/lib/noir/shuffle.ts").deserializeDeck;
};

export type Point = import("../../frontend/src/lib/cards/elgamal.ts").Point;

export const computeAggregateKey = elgamalModule.computeAggregateKey;
export const MentalPokerSession = mentalPokerModule.MentalPokerSession;
export const serializeDeck = shuffleModule.serializeDeck;
export const deserializeDeck = shuffleModule.deserializeDeck;
