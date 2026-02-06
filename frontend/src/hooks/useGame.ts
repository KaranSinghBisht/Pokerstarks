"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { init, ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import type {
  TableData,
  SeatData,
  HandData,
  PlayerHandData,
  CommunityCardsData,
} from "@/lib/types";
import { WORLD_ADDRESS, TORII_URL, NAMESPACE } from "@/lib/dojo-config";

// Schema definition matching our Dojo models
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DojoSchema = any;

// Parse raw entity data into our typed interfaces
function parseTable(models: Record<string, unknown>): TableData | null {
  const t = models[`${NAMESPACE}-Table`] as Record<string, unknown> | undefined;
  if (!t) return null;
  return {
    tableId: Number(t.table_id),
    creator: String(t.creator ?? ""),
    maxPlayers: Number(t.max_players),
    smallBlind: BigInt(String(t.small_blind ?? "0")),
    bigBlind: BigInt(String(t.big_blind ?? "0")),
    minBuyIn: BigInt(String(t.min_buy_in ?? "0")),
    maxBuyIn: BigInt(String(t.max_buy_in ?? "0")),
    state: String(t.state ?? "Waiting"),
    currentHandId: Number(t.current_hand_id),
    dealerSeat: Number(t.dealer_seat),
    playerCount: Number(t.player_count),
  };
}

function parseSeat(models: Record<string, unknown>): SeatData | null {
  const s = models[`${NAMESPACE}-Seat`] as Record<string, unknown> | undefined;
  if (!s) return null;
  return {
    tableId: Number(s.table_id),
    seatIndex: Number(s.seat_index),
    player: String(s.player ?? ""),
    chips: BigInt(String(s.chips ?? "0")),
    isOccupied: Boolean(s.is_occupied),
    isReady: Boolean(s.is_ready),
    isSittingOut: Boolean(s.is_sitting_out),
  };
}

function parseHand(models: Record<string, unknown>): HandData | null {
  const h = models[`${NAMESPACE}-Hand`] as Record<string, unknown> | undefined;
  if (!h) return null;
  return {
    handId: Number(h.hand_id),
    tableId: Number(h.table_id),
    phase: String(h.phase ?? "Setup"),
    pot: BigInt(String(h.pot ?? "0")),
    currentBet: BigInt(String(h.current_bet ?? "0")),
    activePlayers: Number(h.active_players),
    numPlayers: Number(h.num_players),
    currentTurnSeat: Number(h.current_turn_seat),
    dealerSeat: Number(h.dealer_seat),
    shuffleProgress: Number(h.shuffle_progress),
    phaseDeadline: Number(h.phase_deadline),
  };
}

function parsePlayerHand(models: Record<string, unknown>): PlayerHandData | null {
  const ph = models[`${NAMESPACE}-PlayerHand`] as Record<string, unknown> | undefined;
  if (!ph) return null;
  return {
    handId: Number(ph.hand_id),
    seatIndex: Number(ph.seat_index),
    player: String(ph.player ?? ""),
    betThisRound: BigInt(String(ph.bet_this_round ?? "0")),
    totalBet: BigInt(String(ph.total_bet ?? "0")),
    hasFolded: Boolean(ph.has_folded),
    hasActed: Boolean(ph.has_acted),
    isAllIn: Boolean(ph.is_all_in),
    holeCard1Id: Number(ph.hole_card_1_id ?? 255),
    holeCard2Id: Number(ph.hole_card_2_id ?? 255),
  };
}

function parseCommunityCards(models: Record<string, unknown>): CommunityCardsData | null {
  const c = models[`${NAMESPACE}-CommunityCards`] as Record<string, unknown> | undefined;
  if (!c) return null;
  return {
    handId: Number(c.hand_id),
    flop1: Number(c.flop_1 ?? 255),
    flop2: Number(c.flop_2 ?? 255),
    flop3: Number(c.flop_3 ?? 255),
    turn: Number(c.turn ?? 255),
    river: Number(c.river ?? 255),
  };
}

// Mock data fallback when Torii is not available
function makeMockTable(tableId: number): TableData {
  return {
    tableId,
    creator: "0x1234...abcd",
    maxPlayers: 6,
    smallBlind: 5n,
    bigBlind: 10n,
    minBuyIn: 100n,
    maxBuyIn: 1000n,
    state: "Waiting",
    currentHandId: 0,
    dealerSeat: 0,
    playerCount: 2,
  };
}

function makeMockSeats(tableId: number): SeatData[] {
  return [
    {
      tableId,
      seatIndex: 0,
      player: "0x1234567890abcdef1234567890abcdef12345678",
      chips: 500n,
      isOccupied: true,
      isReady: false,
      isSittingOut: false,
    },
    {
      tableId,
      seatIndex: 3,
      player: "0xabcdef1234567890abcdef1234567890abcdef12",
      chips: 750n,
      isOccupied: true,
      isReady: false,
      isSittingOut: false,
    },
  ];
}

interface UseGameReturn {
  table: TableData | null;
  seats: SeatData[];
  hand: HandData | undefined;
  playerHands: PlayerHandData[];
  communityCards: CommunityCardsData | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGame(tableId: number): UseGameReturn {
  const [table, setTable] = useState<TableData | null>(null);
  const [seats, setSeats] = useState<SeatData[]>([]);
  const [hand, setHand] = useState<HandData | undefined>(undefined);
  const [playerHands, setPlayerHands] = useState<PlayerHandData[]>([]);
  const [communityCards, setCommunityCards] = useState<
    CommunityCardsData | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sdkRef = useRef<Awaited<ReturnType<typeof init<DojoSchema>>> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptionRef = useRef<any>(null);

  const loadFromTorii = useCallback(async () => {
    try {
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

      // Fetch table data
      const tableRes = await sdk.getEntities({
        query: new ToriiQueryBuilder<DojoSchema>()
          .withClause(
            KeysClause([`${NAMESPACE}-Table`], [String(tableId)]).build()
          )
          .withLimit(1),
      });
      const tableItems = tableRes.getItems();
      if (tableItems.length > 0) {
        const parsed = parseTable(tableItems[0].models?.[NAMESPACE] ?? {});
        if (parsed) setTable(parsed);
      }

      // Fetch seats (all 6 possible)
      const seatList: SeatData[] = [];
      for (let i = 0; i < 6; i++) {
        const seatRes = await sdk.getEntities({
          query: new ToriiQueryBuilder<DojoSchema>()
            .withClause(
              KeysClause(
                [`${NAMESPACE}-Seat`],
                [String(tableId), String(i)]
              ).build()
            )
            .withLimit(1),
        });
        const seatItems = seatRes.getItems();
        if (seatItems.length > 0) {
          const parsed = parseSeat(seatItems[0].models?.[NAMESPACE] ?? {});
          if (parsed && parsed.isOccupied) seatList.push(parsed);
        }
      }
      setSeats(seatList);

      // Clean up previous subscription if any
      if (subscriptionRef.current) {
        try { subscriptionRef.current.cancel?.(); } catch { /* ignore */ }
      }

      // Subscribe to entity updates for real-time changes
      subscriptionRef.current = await sdk.subscribeEntityQuery({
        query: new ToriiQueryBuilder<DojoSchema>()
          .withClause(
            KeysClause([`${NAMESPACE}-Table`], [String(tableId)]).build()
          ),
        callback: ({ data }) => {
          if (!data) return;
          const items = Array.isArray(data) ? data : [data];
          for (const entity of items) {
            const models = entity.models?.[NAMESPACE] ?? {};
            const t = parseTable(models);
            if (t) setTable(t);
            const s = parseSeat(models);
            if (s) {
              setSeats((prev) => {
                const idx = prev.findIndex(
                  (x) => x.seatIndex === s.seatIndex
                );
                if (s.isOccupied) {
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = s;
                    return next;
                  }
                  return [...prev, s];
                } else {
                  return prev.filter((x) => x.seatIndex !== s.seatIndex);
                }
              });
            }
            const h = parseHand(models);
            if (h) setHand(h);
            const ph = parsePlayerHand(models);
            if (ph) {
              setPlayerHands((prev) => {
                const idx = prev.findIndex(
                  (x) => x.seatIndex === ph.seatIndex
                );
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = ph;
                  return next;
                }
                return [...prev, ph];
              });
            }
            const cc = parseCommunityCards(models);
            if (cc) setCommunityCards(cc);
          }
        },
      });

      setLoading(false);
    } catch (err) {
      console.warn("Torii connection failed, using mock data:", err);
      // Fallback to mock data
      setTable(makeMockTable(tableId));
      setSeats(makeMockSeats(tableId));
      setHand(undefined);
      setPlayerHands([]);
      setCommunityCards(undefined);
      setError(null);
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    loadFromTorii();
    return () => {
      if (subscriptionRef.current) {
        try { subscriptionRef.current.cancel?.(); } catch { /* ignore */ }
        subscriptionRef.current = null;
      }
    };
  }, [loadFromTorii]);

  return {
    table,
    seats,
    hand,
    playerHands,
    communityCards,
    loading,
    error,
    refresh: loadFromTorii,
  };
}
