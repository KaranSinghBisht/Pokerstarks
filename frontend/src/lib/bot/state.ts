/**
 * Game state reader — polls Torii via the Dojo SDK.
 * Port of scripts/bot/state.ts for Next.js server-side use.
 */

import { init, ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import { log } from "./log";
import { WORLD_ADDRESS, TORII_URL, NAMESPACE } from "@/lib/dojo-config";

// ───────────────────── Types ─────────────────────

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
  tokenAddress: string;
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
  aggKeyConfirmations: number;
  deckSeed: string;
  deckHashConfirmations: number;
  initialDeckHash: string;
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

export interface CardDecryptionVoteData {
  handId: number;
  cardPosition: number;
  voterSeat: number;
  cardId: number;
  submitted: boolean;
}

export interface GameState {
  table: TableData | null;
  seats: SeatData[];
  hand: HandData | null;
  playerHands: PlayerHandData[];
  communityCards: CommunityCardsData | null;
  currentDeck: EncryptedDeckData | null;
  revealTokens: RevealTokenData[];
  cardVotes: CardDecryptionVoteData[];
}

// ───────────────────── Parsing helpers ─────────────────────

const MODELS = {
  table: `${NAMESPACE}-Table`,
  seat: `${NAMESPACE}-Seat`,
  hand: `${NAMESPACE}-Hand`,
  playerHand: `${NAMESPACE}-PlayerHand`,
  communityCards: `${NAMESPACE}-CommunityCards`,
  encryptedDeck: `${NAMESPACE}-EncryptedDeck`,
  revealToken: `${NAMESPACE}-RevealToken`,
  cardDecryptionVote: `${NAMESPACE}-CardDecryptionVote`,
} as const;

/** Resolve a model from the namespace-extracted models object.
 *  Dojo SDK v1.9+ uses short names ("Table") after namespace extraction,
 *  but older versions may use qualified names ("pokerstarks-Table").
 */
function getModel(models: Record<string, unknown>, qualifiedName: string): Record<string, unknown> | undefined {
  const shortName = qualifiedName.includes("-") ? qualifiedName.split("-").slice(1).join("-") : qualifiedName;
  return (models[shortName] ?? models[qualifiedName]) as Record<string, unknown> | undefined;
}

/** Normalize a Starknet address: strip leading zeros, lowercase, always 0x-prefixed. */
function asAddress(v: unknown): string {
  if (!v) return "0x0";
  const s = String(v);
  try {
    if (BigInt(s) === 0n) return "0x0";
  } catch { /* not a number, use as-is */ }
  if (s.startsWith("0x") || s.startsWith("0X")) {
    return "0x" + s.slice(2).replace(/^0+/, "").toLowerCase();
  }
  return "0x" + s.toLowerCase();
}

function asNum(v: unknown, fallback = 0): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.length > 0) return Number(v);
  return fallback;
}

function asBig(v: unknown, fallback = 0n): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string" && v.length > 0) return BigInt(v);
  return fallback;
}

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "bigint") return v !== 0n;
  if (typeof v === "string") return v === "true" || v === "1";
  return false;
}

function asEnum(v: unknown, fallback: string): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>);
    if (keys.length > 0) return keys[0];
  }
  return fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DojoSchema = any;

function parseTable(models: Record<string, unknown>): TableData | null {
  const t = getModel(models, MODELS.table);
  if (!t) return null;
  return {
    tableId: asNum(t.table_id),
    creator: asAddress(t.creator),
    maxPlayers: asNum(t.max_players),
    smallBlind: asBig(t.small_blind),
    bigBlind: asBig(t.big_blind),
    minBuyIn: asBig(t.min_buy_in),
    maxBuyIn: asBig(t.max_buy_in),
    state: asEnum(t.state, "Waiting"),
    currentHandId: asNum(t.current_hand_id),
    dealerSeat: asNum(t.dealer_seat),
    playerCount: asNum(t.player_count),
    tokenAddress: asAddress(t.token_address),
  };
}

function parseSeat(models: Record<string, unknown>): SeatData | null {
  const s = getModel(models, MODELS.seat);
  if (!s) return null;
  return {
    tableId: asNum(s.table_id),
    seatIndex: asNum(s.seat_index),
    player: asAddress(s.player),
    chips: asBig(s.chips),
    isOccupied: asBool(s.is_occupied),
    isReady: asBool(s.is_ready),
    isSittingOut: asBool(s.is_sitting_out),
  };
}

function parseHand(models: Record<string, unknown>): HandData | null {
  const h = getModel(models, MODELS.hand);
  if (!h) return null;
  return {
    handId: asNum(h.hand_id),
    tableId: asNum(h.table_id),
    phase: asEnum(h.phase, "Setup"),
    pot: asBig(h.pot),
    currentBet: asBig(h.current_bet),
    activePlayers: asNum(h.active_players),
    numPlayers: asNum(h.num_players),
    currentTurnSeat: asNum(h.current_turn_seat),
    dealerSeat: asNum(h.dealer_seat),
    shuffleProgress: asNum(h.shuffle_progress),
    phaseDeadline: asNum(h.phase_deadline),
    aggPubKeyX: String(h.agg_pub_key_x ?? "0"),
    aggPubKeyY: String(h.agg_pub_key_y ?? "0"),
    keysSubmitted: asNum(h.keys_submitted),
    aggKeyConfirmations: asNum(h.agg_key_confirmations),
    deckSeed: String(h.deck_seed ?? "0"),
    deckHashConfirmations: asNum(h.deck_hash_confirmations),
    initialDeckHash: String(h.initial_deck_hash ?? "0"),
  };
}

function parsePlayerHand(
  models: Record<string, unknown>,
): PlayerHandData | null {
  const ph = getModel(models, MODELS.playerHand);
  if (!ph) return null;
  return {
    handId: asNum(ph.hand_id),
    seatIndex: asNum(ph.seat_index),
    player: asAddress(ph.player),
    publicKeyX: String(ph.public_key_x ?? "0"),
    publicKeyY: String(ph.public_key_y ?? "0"),
    betThisRound: asBig(ph.bet_this_round),
    totalBet: asBig(ph.total_bet),
    hasFolded: asBool(ph.has_folded),
    hasActed: asBool(ph.has_acted),
    isAllIn: asBool(ph.is_all_in),
    holeCard1Pos: asNum(ph.hole_card_1_pos),
    holeCard2Pos: asNum(ph.hole_card_2_pos),
    holeCard1Id: asNum(ph.hole_card_1_id, 255),
    holeCard2Id: asNum(ph.hole_card_2_id, 255),
    submittedAggX: String(ph.submitted_agg_x ?? "0"),
    submittedAggY: String(ph.submitted_agg_y ?? "0"),
    submittedDeckHash: String(ph.submitted_deck_hash ?? "0"),
  };
}

function parseCommunityCards(
  models: Record<string, unknown>,
): CommunityCardsData | null {
  const c = getModel(models, MODELS.communityCards);
  if (!c) return null;
  return {
    handId: asNum(c.hand_id),
    flop1: asNum(c.flop_1, 255),
    flop2: asNum(c.flop_2, 255),
    flop3: asNum(c.flop_3, 255),
    turn: asNum(c.turn, 255),
    river: asNum(c.river, 255),
    flop1Pos: asNum(c.flop_1_pos),
    flop2Pos: asNum(c.flop_2_pos),
    flop3Pos: asNum(c.flop_3_pos),
    turnPos: asNum(c.turn_pos),
    riverPos: asNum(c.river_pos),
  };
}

function parseEncryptedDeck(
  models: Record<string, unknown>,
): EncryptedDeckData | null {
  const d = getModel(models, MODELS.encryptedDeck);
  if (!d) return null;
  const cards = (d.cards as string[] | undefined) ?? [];
  return {
    handId: asNum(d.hand_id),
    version: asNum(d.version),
    cards: cards.map(String),
  };
}

function parseRevealToken(
  models: Record<string, unknown>,
): RevealTokenData | null {
  const t = getModel(models, MODELS.revealToken);
  if (!t) return null;
  return {
    handId: asNum(t.hand_id),
    cardPosition: asNum(t.card_position),
    playerSeat: asNum(t.player_seat),
    tokenX: String(t.token_x ?? "0"),
    tokenY: String(t.token_y ?? "0"),
    proofVerified: asBool(t.proof_verified),
  };
}

function parseCardDecryptionVote(
  models: Record<string, unknown>,
): CardDecryptionVoteData | null {
  const v = getModel(models, MODELS.cardDecryptionVote);
  if (!v) return null;
  return {
    handId: asNum(v.hand_id),
    cardPosition: asNum(v.card_position),
    voterSeat: asNum(v.voter_seat),
    cardId: asNum(v.card_id),
    submitted: asBool(v.submitted),
  };
}

// ───────────────────── State Reader ─────────────────────

export class StateReader {
  private sdk: Awaited<ReturnType<typeof init<DojoSchema>>> | null = null;

  private async getSDK() {
    if (!this.sdk) {
      this.sdk = await init<DojoSchema>({
        client: {
          worldAddress: WORLD_ADDRESS,
          toriiUrl: TORII_URL,
        },
        domain: {
          name: "STARK POKER",
          version: "1.0.0",
          chainId: "SN_SEPOLIA",
        },
      });
    }
    return this.sdk;
  }

  private async fetchModel(
    model: `${string}-${string}`,
    keys: string[],
    limit = 200,
  ) {
    const sdk = await this.getSDK();
    const res = await sdk.getEntities({
      query: new ToriiQueryBuilder<DojoSchema>()
        .withClause(KeysClause([model], keys).build())
        .withLimit(limit),
    });
    return res.getItems();
  }

  async poll(tableId: number): Promise<GameState> {
    const empty: GameState = {
      table: null,
      seats: [],
      hand: null,
      playerHands: [],
      communityCards: null,
      currentDeck: null,
      revealTokens: [],
      cardVotes: [],
    };

    try {
      const [tableEntities, seatEntities] = await Promise.all([
        this.fetchModel(MODELS.table, [String(tableId)], 1),
        this.fetchModel(MODELS.seat, [String(tableId)], 16),
      ]);

      const table =
        tableEntities.length > 0
          ? parseTable(tableEntities[0].models?.[NAMESPACE] ?? {})
          : null;
      if (!table) return empty;

      const seats: SeatData[] = [];
      for (const entity of seatEntities) {
        const seat = parseSeat(entity.models?.[NAMESPACE] ?? {});
        if (seat?.isOccupied) seats.push(seat);
      }
      seats.sort((a, b) => a.seatIndex - b.seatIndex);

      let hand: HandData | null = null;
      let playerHands: PlayerHandData[] = [];
      let communityCards: CommunityCardsData | null = null;
      let currentDeck: EncryptedDeckData | null = null;
      let revealTokens: RevealTokenData[] = [];
      let cardVotes: CardDecryptionVoteData[] = [];

      const handId = table.currentHandId;
      if (handId > 0) {
        const [handE, phE, ccE, deckE, tokenE, voteE] = await Promise.all([
          this.fetchModel(MODELS.hand, [String(handId)], 1),
          this.fetchModel(MODELS.playerHand, [String(handId)], 16),
          this.fetchModel(MODELS.communityCards, [String(handId)], 1),
          this.fetchModel(MODELS.encryptedDeck, [String(handId)], 64),
          this.fetchModel(MODELS.revealToken, [String(handId)], 1500),
          this.fetchModel(MODELS.cardDecryptionVote, [String(handId)], 512),
        ]);

        if (handE.length > 0) {
          hand = parseHand(handE[0].models?.[NAMESPACE] ?? {});
        }

        for (const e of phE) {
          const ph = parsePlayerHand(e.models?.[NAMESPACE] ?? {});
          if (ph && ph.player && ph.player !== "0x0") playerHands.push(ph);
        }
        playerHands.sort((a, b) => a.seatIndex - b.seatIndex);

        if (ccE.length > 0) {
          communityCards = parseCommunityCards(
            ccE[0].models?.[NAMESPACE] ?? {},
          );
        }

        for (const e of deckE) {
          const deck = parseEncryptedDeck(e.models?.[NAMESPACE] ?? {});
          if (deck && (!currentDeck || deck.version >= currentDeck.version)) {
            currentDeck = deck;
          }
        }

        for (const e of tokenE) {
          const token = parseRevealToken(e.models?.[NAMESPACE] ?? {});
          if (token) revealTokens.push(token);
        }
        revealTokens.sort((a, b) =>
          a.cardPosition !== b.cardPosition
            ? a.cardPosition - b.cardPosition
            : a.playerSeat - b.playerSeat,
        );

        for (const e of voteE) {
          const vote = parseCardDecryptionVote(e.models?.[NAMESPACE] ?? {});
          if (vote && vote.submitted) cardVotes.push(vote);
        }
        cardVotes.sort((a, b) =>
          a.cardPosition !== b.cardPosition
            ? a.cardPosition - b.cardPosition
            : a.voterSeat - b.voterSeat,
        );
      }

      return {
        table,
        seats,
        hand,
        playerHands,
        communityCards,
        currentDeck,
        revealTokens,
        cardVotes,
      };
    } catch (err) {
      log.error(
        `State poll failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return empty;
    }
  }
}
