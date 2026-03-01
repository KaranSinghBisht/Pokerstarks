export interface TableData {
  tableId: number;
  creator: string;
  maxPlayers: number;
  smallBlind: bigint;
  bigBlind: bigint;
  minBuyIn: bigint;
  maxBuyIn: bigint;
  state: string;
  currentHandId: number;
  dealerSeat: number;
  playerCount: number;
  // Rake
  rakeBps: number;
  rakeCap: bigint;
  rakeRecipient: string;
  // Private table
  isPrivate: boolean;
  inviteCodeHash: string;
  // Token
  tokenAddress: string;
  // Verifier contracts
  shuffleVerifier: string;
  decryptVerifier: string;
}

export interface SeatData {
  tableId: number;
  seatIndex: number;
  player: string;
  chips: bigint;
  isOccupied: boolean;
  isReady: boolean;
  isSittingOut: boolean;
}

export interface PlayerHandData {
  handId: number;
  seatIndex: number;
  player: string;
  publicKeyX: string;
  publicKeyY: string;
  betThisRound: bigint;
  totalBet: bigint;
  hasFolded: boolean;
  hasActed: boolean;
  isAllIn: boolean;
  holeCard1Pos: number;
  holeCard2Pos: number;
  holeCard1Id: number;
  holeCard2Id: number;
  // Consensus fields
  submittedAggX: string;
  submittedAggY: string;
  submittedDeckHash: string;
}

export interface CommunityCardsData {
  handId: number;
  flop1: number;
  flop2: number;
  flop3: number;
  turn: number;
  river: number;
  flop1Pos: number;
  flop2Pos: number;
  flop3Pos: number;
  turnPos: number;
  riverPos: number;
}

export interface EncryptedDeckData {
  handId: number;
  version: number;
  cards: string[];
}

export interface RevealTokenData {
  handId: number;
  cardPosition: number;
  playerSeat: number;
  tokenX: string;
  tokenY: string;
  proofVerified: boolean;
}

export interface HandData {
  handId: number;
  tableId: number;
  phase: string;
  pot: bigint;
  currentBet: bigint;
  activePlayers: number;
  numPlayers: number;
  currentTurnSeat: number;
  dealerSeat: number;
  shuffleProgress: number;
  phaseDeadline: number;
  aggPubKeyX: string;
  aggPubKeyY: string;
  keysSubmitted: number;
  // Security consensus fields
  aggKeyConfirmations: number;
  deckSeed: string;
  deckHashConfirmations: number;
  initialDeckHash: string;
}

export interface SidePotData {
  handId: number;
  potIndex: number;
  amount: bigint;
  eligibleMask: number;
}
