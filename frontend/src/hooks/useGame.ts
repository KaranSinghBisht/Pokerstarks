"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { init, ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import type {
  TableData,
  SeatData,
  HandData,
  PlayerHandData,
  CommunityCardsData,
  EncryptedDeckData,
  RevealTokenData,
} from "@/lib/types";
import { WORLD_ADDRESS, TORII_URL, NAMESPACE } from "@/lib/dojo-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DojoSchema = any;

const MODELS = {
  table: `${NAMESPACE}-Table`,
  seat: `${NAMESPACE}-Seat`,
  hand: `${NAMESPACE}-Hand`,
  playerHand: `${NAMESPACE}-PlayerHand`,
  communityCards: `${NAMESPACE}-CommunityCards`,
  encryptedDeck: `${NAMESPACE}-EncryptedDeck`,
  revealToken: `${NAMESPACE}-RevealToken`,
} as const;

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) return Number(value);
  return fallback;
}

function asBigInt(value: unknown, fallback: bigint = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  return fallback;
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  if (typeof value === "string") return value === "true" || value === "1";
  return false;
}

function asEnum(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0) return keys[0];
  }
  return fallback;
}

function parseTable(models: Record<string, unknown>): TableData | null {
  const t = models[MODELS.table] as Record<string, unknown> | undefined;
  if (!t) return null;
  return {
    tableId: asNumber(t.table_id),
    creator: String(t.creator ?? ""),
    maxPlayers: asNumber(t.max_players),
    smallBlind: asBigInt(t.small_blind),
    bigBlind: asBigInt(t.big_blind),
    minBuyIn: asBigInt(t.min_buy_in),
    maxBuyIn: asBigInt(t.max_buy_in),
    state: asEnum(t.state, "Waiting"),
    currentHandId: asNumber(t.current_hand_id),
    dealerSeat: asNumber(t.dealer_seat),
    playerCount: asNumber(t.player_count),
    rakeBps: asNumber(t.rake_bps),
    rakeCap: asBigInt(t.rake_cap),
    rakeRecipient: String(t.rake_recipient ?? "0x0"),
    isPrivate: asBool(t.is_private),
    inviteCodeHash: String(t.invite_code_hash ?? "0"),
    tokenAddress: String(t.token_address ?? "0x0"),
  };
}

function parseSeat(models: Record<string, unknown>): SeatData | null {
  const s = models[MODELS.seat] as Record<string, unknown> | undefined;
  if (!s) return null;
  return {
    tableId: asNumber(s.table_id),
    seatIndex: asNumber(s.seat_index),
    player: String(s.player ?? ""),
    chips: asBigInt(s.chips),
    isOccupied: asBool(s.is_occupied),
    isReady: asBool(s.is_ready),
    isSittingOut: asBool(s.is_sitting_out),
  };
}

function parseHand(models: Record<string, unknown>): HandData | null {
  const h = models[MODELS.hand] as Record<string, unknown> | undefined;
  if (!h) return null;
  return {
    handId: asNumber(h.hand_id),
    tableId: asNumber(h.table_id),
    phase: asEnum(h.phase, "Setup"),
    pot: asBigInt(h.pot),
    currentBet: asBigInt(h.current_bet),
    activePlayers: asNumber(h.active_players),
    numPlayers: asNumber(h.num_players),
    currentTurnSeat: asNumber(h.current_turn_seat),
    dealerSeat: asNumber(h.dealer_seat),
    shuffleProgress: asNumber(h.shuffle_progress),
    phaseDeadline: asNumber(h.phase_deadline),
    aggPubKeyX: String(h.agg_pub_key_x ?? "0"),
    aggPubKeyY: String(h.agg_pub_key_y ?? "0"),
    keysSubmitted: asNumber(h.keys_submitted),
    aggKeyConfirmations: asNumber(h.agg_key_confirmations),
    deckSeed: String(h.deck_seed ?? "0"),
    deckHashConfirmations: asNumber(h.deck_hash_confirmations),
    initialDeckHash: String(h.initial_deck_hash ?? "0"),
  };
}

function parsePlayerHand(models: Record<string, unknown>): PlayerHandData | null {
  const ph = models[MODELS.playerHand] as Record<string, unknown> | undefined;
  if (!ph) return null;
  return {
    handId: asNumber(ph.hand_id),
    seatIndex: asNumber(ph.seat_index),
    player: String(ph.player ?? ""),
    publicKeyX: String(ph.public_key_x ?? "0"),
    publicKeyY: String(ph.public_key_y ?? "0"),
    betThisRound: asBigInt(ph.bet_this_round),
    totalBet: asBigInt(ph.total_bet),
    hasFolded: asBool(ph.has_folded),
    hasActed: asBool(ph.has_acted),
    isAllIn: asBool(ph.is_all_in),
    holeCard1Pos: asNumber(ph.hole_card_1_pos),
    holeCard2Pos: asNumber(ph.hole_card_2_pos),
    holeCard1Id: asNumber(ph.hole_card_1_id, 255),
    holeCard2Id: asNumber(ph.hole_card_2_id, 255),
    submittedAggX: String(ph.submitted_agg_x ?? "0"),
    submittedAggY: String(ph.submitted_agg_y ?? "0"),
    submittedDeckHash: String(ph.submitted_deck_hash ?? "0"),
  };
}

function parseCommunityCards(models: Record<string, unknown>): CommunityCardsData | null {
  const c = models[MODELS.communityCards] as Record<string, unknown> | undefined;
  if (!c) return null;
  return {
    handId: asNumber(c.hand_id),
    flop1: asNumber(c.flop_1, 255),
    flop2: asNumber(c.flop_2, 255),
    flop3: asNumber(c.flop_3, 255),
    turn: asNumber(c.turn, 255),
    river: asNumber(c.river, 255),
    flop1Pos: asNumber(c.flop_1_pos),
    flop2Pos: asNumber(c.flop_2_pos),
    flop3Pos: asNumber(c.flop_3_pos),
    turnPos: asNumber(c.turn_pos),
    riverPos: asNumber(c.river_pos),
  };
}

function parseEncryptedDeck(models: Record<string, unknown>): EncryptedDeckData | null {
  const d = models[MODELS.encryptedDeck] as Record<string, unknown> | undefined;
  if (!d) return null;
  const cards = (d.cards as string[] | undefined) ?? [];
  return {
    handId: asNumber(d.hand_id),
    version: asNumber(d.version),
    cards: cards.map(String),
  };
}

function parseRevealToken(models: Record<string, unknown>): RevealTokenData | null {
  const t = models[MODELS.revealToken] as Record<string, unknown> | undefined;
  if (!t) return null;
  return {
    handId: asNumber(t.hand_id),
    cardPosition: asNumber(t.card_position),
    playerSeat: asNumber(t.player_seat),
    tokenX: String(t.token_x ?? "0"),
    tokenY: String(t.token_y ?? "0"),
    proofVerified: asBool(t.proof_verified),
  };
}

interface UseGameReturn {
  table: TableData | null;
  seats: SeatData[];
  hand: HandData | undefined;
  playerHands: PlayerHandData[];
  communityCards: CommunityCardsData | undefined;
  currentDeck: EncryptedDeckData | null;
  revealTokens: RevealTokenData[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGame(tableId: number): UseGameReturn {
  const [table, setTable] = useState<TableData | null>(null);
  const [seats, setSeats] = useState<SeatData[]>([]);
  const [hand, setHand] = useState<HandData | undefined>(undefined);
  const [playerHands, setPlayerHands] = useState<PlayerHandData[]>([]);
  const [communityCards, setCommunityCards] = useState<CommunityCardsData | undefined>(undefined);
  const [currentDeck, setCurrentDeck] = useState<EncryptedDeckData | null>(null);
  const [revealTokens, setRevealTokens] = useState<RevealTokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sdkRef = useRef<Awaited<ReturnType<typeof init<DojoSchema>>> | null>(null);

  const fetchModel = useCallback(
    async (
      sdk: Awaited<ReturnType<typeof init<DojoSchema>>>,
      model: `${string}-${string}`,
      keys: string[],
      limit = 200,
    ) => {
      const res = await sdk.getEntities({
        query: new ToriiQueryBuilder<DojoSchema>()
          .withClause(KeysClause([model], keys).build())
          .withLimit(limit),
      });
      return res.getItems();
    },
    [],
  );

  const loadFromTorii = useCallback(async () => {
    try {
      if (!Number.isFinite(tableId) || tableId < 0) {
        throw new Error("Invalid table id.");
      }
      if (!WORLD_ADDRESS || WORLD_ADDRESS === "0x0") {
        throw new Error("NEXT_PUBLIC_WORLD_ADDRESS is not configured.");
      }
      if (!sdkRef.current) {
        sdkRef.current = await init<DojoSchema>({
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
      const sdk = sdkRef.current;

      const [tableEntities, seatEntities] = await Promise.all([
        fetchModel(sdk, MODELS.table, [String(tableId)], 1),
        fetchModel(sdk, MODELS.seat, [String(tableId)], 16),
      ]);

      const tableParsed =
        tableEntities.length > 0
          ? parseTable(tableEntities[0].models?.[NAMESPACE] ?? {})
          : null;
      if (!tableParsed) {
        setTable(null);
        setSeats([]);
        setHand(undefined);
        setPlayerHands([]);
        setCommunityCards(undefined);
        setCurrentDeck(null);
        setRevealTokens([]);
        setError(`Table #${tableId} not found.`);
        setLoading(false);
        return;
      }

      const seatParsed: SeatData[] = [];
      for (const entity of seatEntities) {
        const seat = parseSeat(entity.models?.[NAMESPACE] ?? {});
        if (seat && seat.isOccupied) seatParsed.push(seat);
      }
      seatParsed.sort((a, b) => a.seatIndex - b.seatIndex);

      let handParsed: HandData | undefined;
      let playerHandParsed: PlayerHandData[] = [];
      let communityParsed: CommunityCardsData | undefined;
      let deckParsed: EncryptedDeckData | null = null;
      let tokenParsed: RevealTokenData[] = [];

      const handId = tableParsed.currentHandId;
      if (handId > 0) {
        const [
          handEntities,
          playerHandEntities,
          communityEntities,
          encryptedDeckEntities,
          revealTokenEntities,
        ] = await Promise.all([
          fetchModel(sdk, MODELS.hand, [String(handId)], 1),
          fetchModel(sdk, MODELS.playerHand, [String(handId)], 16),
          fetchModel(sdk, MODELS.communityCards, [String(handId)], 1),
          fetchModel(sdk, MODELS.encryptedDeck, [String(handId)], 64),
          fetchModel(sdk, MODELS.revealToken, [String(handId)], 1500),
        ]);

        if (handEntities.length > 0) {
          handParsed = parseHand(handEntities[0].models?.[NAMESPACE] ?? {}) ?? undefined;
        }

        for (const entity of playerHandEntities) {
          const ph = parsePlayerHand(entity.models?.[NAMESPACE] ?? {});
          if (!ph) continue;
          if (!ph.player || ph.player === "0x0") continue;
          playerHandParsed.push(ph);
        }
        playerHandParsed.sort((a, b) => a.seatIndex - b.seatIndex);

        if (communityEntities.length > 0) {
          communityParsed =
            parseCommunityCards(communityEntities[0].models?.[NAMESPACE] ?? {}) ?? undefined;
        }

        for (const entity of encryptedDeckEntities) {
          const deck = parseEncryptedDeck(entity.models?.[NAMESPACE] ?? {});
          if (!deck) continue;
          if (!deckParsed || deck.version >= deckParsed.version) {
            deckParsed = deck;
          }
        }

        for (const entity of revealTokenEntities) {
          const token = parseRevealToken(entity.models?.[NAMESPACE] ?? {});
          if (token) tokenParsed.push(token);
        }
        tokenParsed.sort((a, b) => {
          if (a.cardPosition !== b.cardPosition) return a.cardPosition - b.cardPosition;
          return a.playerSeat - b.playerSeat;
        });
      }

      setTable(tableParsed);
      setSeats(seatParsed);
      setHand(handParsed);
      setPlayerHands(playerHandParsed);
      setCommunityCards(communityParsed);
      setCurrentDeck(deckParsed);
      setRevealTokens(tokenParsed);
      setError(null);
      setLoading(false);
    } catch (err) {
      setTable(null);
      setSeats([]);
      setHand(undefined);
      setPlayerHands([]);
      setCommunityCards(undefined);
      setCurrentDeck(null);
      setRevealTokens([]);
      setError(err instanceof Error ? err.message : "Failed to load game state.");
      setLoading(false);
    }
  }, [fetchModel, tableId]);

  useEffect(() => {
    loadFromTorii();
    const id = window.setInterval(loadFromTorii, 2000);
    return () => window.clearInterval(id);
  }, [loadFromTorii]);

  return {
    table,
    seats,
    hand,
    playerHands,
    communityCards,
    currentDeck,
    revealTokens,
    loading,
    error,
    refresh: loadFromTorii,
  };
}
