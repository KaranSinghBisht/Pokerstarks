"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  TableData,
  SeatData,
  HandData,
  PlayerHandData,
  CommunityCardsData,
} from "@/lib/types";

// Mock data for development — will be replaced by Torii subscriptions
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

  const loadData = useCallback(() => {
    // TODO: Replace with actual Torii subscription
    // const toriiClient = await createClient({ toriiUrl: TORII_URL, ... });
    // Subscribe to Table, Seat, Hand, PlayerHand, CommunityCards models
    // Filter by table_id = tableId
    try {
      setTable(makeMockTable(tableId));
      setSeats(makeMockSeats(tableId));
      setHand(undefined);
      setPlayerHands([]);
      setCommunityCards(undefined);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load game");
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    table,
    seats,
    hand,
    playerHands,
    communityCards,
    loading,
    error,
    refresh: loadData,
  };
}
