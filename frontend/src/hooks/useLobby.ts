"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { init, ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import { AccountInterface, CallData } from "starknet";
import type { TableData } from "@/lib/types";
import { WORLD_ADDRESS, TORII_URL, NAMESPACE } from "@/lib/dojo-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DojoSchema = any;

// Mock tables for development fallback
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
    rakeBps: 0,
    rakeCap: 0n,
    rakeRecipient: "0x0",
    isPrivate: false,
    inviteCodeHash: "0",
    tokenAddress: "0x0",
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
    rakeBps: 250,
    rakeCap: 50n,
    rakeRecipient: "0x0",
    isPrivate: false,
    inviteCodeHash: "0",
    tokenAddress: "0x0",
  },
];

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
    rakeBps: Number(t.rake_bps ?? 0),
    rakeCap: BigInt(String(t.rake_cap ?? "0")),
    rakeRecipient: String(t.rake_recipient ?? "0x0"),
    isPrivate: Boolean(t.is_private),
    inviteCodeHash: String(t.invite_code_hash ?? "0"),
    tokenAddress: String(t.token_address ?? "0x0"),
  };
}

interface UseLobbyReturn {
  tables: TableData[];
  loading: boolean;
  error: string | null;
  createTable: (
    params: {
      maxPlayers: number;
      smallBlind: bigint;
      bigBlind: bigint;
      minBuyIn: bigint;
      maxBuyIn: bigint;
    },
    account?: AccountInterface | null,
  ) => Promise<void>;
  refresh: () => void;
}

export function useLobby(): UseLobbyReturn {
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sdkRef = useRef<Awaited<ReturnType<typeof init<DojoSchema>>> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptionRef = useRef<any>(null);

  const loadTables = useCallback(async () => {
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

      // Fetch all tables
      const res = await sdk.getEntities({
        query: new ToriiQueryBuilder<DojoSchema>()
          .withClause(KeysClause([`${NAMESPACE}-Table`], []).build())
          .withLimit(50),
      });

      const items = res.getItems();
      const parsed: TableData[] = [];
      for (const entity of items) {
        const models = entity.models?.[NAMESPACE] ?? {};
        const t = parseTable(models);
        if (t) parsed.push(t);
      }

      setTables(parsed.length > 0 ? parsed : MOCK_TABLES);
      setLoading(false);

      // Clean up previous subscription if any
      if (subscriptionRef.current) {
        try { subscriptionRef.current.cancel?.(); } catch { /* ignore */ }
      }

      // Subscribe to new table creations
      subscriptionRef.current = await sdk.subscribeEntityQuery({
        query: new ToriiQueryBuilder<DojoSchema>()
          .withClause(KeysClause([`${NAMESPACE}-Table`], []).build()),
        callback: ({ data }) => {
          if (!data) return;
          const entities = Array.isArray(data) ? data : [data];
          for (const entity of entities) {
            const models = entity.models?.[NAMESPACE] ?? {};
            const t = parseTable(models);
            if (t) {
              setTables((prev) => {
                const idx = prev.findIndex((x) => x.tableId === t.tableId);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = t;
                  return next;
                }
                return [...prev, t];
              });
            }
          }
        },
      });
    } catch (err) {
      console.warn("Torii connection failed, using mock data:", err);
      setTables(MOCK_TABLES);
      setError(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
    return () => {
      if (subscriptionRef.current) {
        try { subscriptionRef.current.cancel?.(); } catch { /* ignore */ }
        subscriptionRef.current = null;
      }
    };
  }, [loadTables]);

  const createTable = useCallback(
    async (
      params: {
        maxPlayers: number;
        smallBlind: bigint;
        bigBlind: bigint;
        minBuyIn: bigint;
        maxBuyIn: bigint;
        rakeBps?: number;
        rakeCap?: bigint;
        rakeRecipient?: string;
        isPrivate?: boolean;
        inviteCodeHash?: string;
        tokenAddress?: string;
      },
      account?: AccountInterface | null,
    ) => {
      const contractAddress = process.env.NEXT_PUBLIC_LOBBY_ADDRESS || "";
      if (!account || !contractAddress) {
        console.log("Create table (mock):", params);
        return;
      }
      const shuffleVerifier = process.env.NEXT_PUBLIC_SHUFFLE_VERIFIER_ADDRESS || "0x0";
      const decryptVerifier = process.env.NEXT_PUBLIC_DECRYPT_VERIFIER_ADDRESS || "0x0";
      await account.execute({
        contractAddress,
        entrypoint: "create_table",
        calldata: CallData.compile([
          String(params.maxPlayers),
          String(params.smallBlind),
          String(params.bigBlind),
          String(params.minBuyIn),
          String(params.maxBuyIn),
          shuffleVerifier,
          decryptVerifier,
          String(params.rakeBps ?? 0),
          String(params.rakeCap ?? 0),
          params.rakeRecipient ?? "0x0",
          params.isPrivate ? "1" : "0",
          params.inviteCodeHash ?? "0",
          params.tokenAddress ?? "0x0",
        ]),
      });
    },
    [],
  );

  return { tables, loading, error, createTable, refresh: loadTables };
}
