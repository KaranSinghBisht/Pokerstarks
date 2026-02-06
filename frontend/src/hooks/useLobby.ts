"use client";

import { useState, useEffect, useCallback } from "react";
import type { TableData } from "@/lib/types";

// Mock tables for development
const MOCK_TABLES: TableData[] = [
  {
    tableId: 0,
    creator: "0x1234",
    maxPlayers: 6,
    smallBlind: 5n,
    bigBlind: 10n,
    minBuyIn: 100n,
    maxBuyIn: 1000n,
    state: "Waiting",
    currentHandId: 0,
    dealerSeat: 0,
    playerCount: 2,
  },
  {
    tableId: 1,
    creator: "0x5678",
    maxPlayers: 6,
    smallBlind: 10n,
    bigBlind: 20n,
    minBuyIn: 200n,
    maxBuyIn: 2000n,
    state: "InProgress",
    currentHandId: 1,
    dealerSeat: 2,
    playerCount: 4,
  },
];

interface UseLobbyReturn {
  tables: TableData[];
  loading: boolean;
  error: string | null;
  createTable: (params: {
    maxPlayers: number;
    smallBlind: bigint;
    bigBlind: bigint;
    minBuyIn: bigint;
    maxBuyIn: bigint;
  }) => Promise<void>;
  refresh: () => void;
}

export function useLobby(): UseLobbyReturn {
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTables = useCallback(() => {
    // TODO: Replace with Torii subscription to Table models
    // const toriiClient = await createClient({ toriiUrl: TORII_URL, ... });
    // Subscribe to all Table models
    try {
      setTables(MOCK_TABLES);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tables");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const createTable = useCallback(
    async (params: {
      maxPlayers: number;
      smallBlind: bigint;
      bigBlind: bigint;
      minBuyIn: bigint;
      maxBuyIn: bigint;
    }) => {
      console.log("Create table:", params);
      // TODO: Execute Dojo contract call
      // await execute("pokerstarks", "lobby_system", "create_table", [
      //   params.maxPlayers, params.smallBlind, params.bigBlind,
      //   params.minBuyIn, params.maxBuyIn
      // ]);
    },
    [],
  );

  return { tables, loading, error, createTable, refresh: loadTables };
}
