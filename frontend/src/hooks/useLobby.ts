"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { init, ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import { CallData } from "starknet";
import type { TableData } from "@/lib/types";
import { WORLD_ADDRESS, TORII_URL, NAMESPACE } from "@/lib/dojo-config";
import { useStarknet } from "@/providers/StarknetProvider";
import { getSystemAddress } from "@/lib/contracts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DojoSchema = any;

const TABLE_MODEL = `${NAMESPACE}-Table`;

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
  const t = models[`${NAMESPACE}-Table`] as Record<string, unknown> | undefined;
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
  ) => Promise<void>;
  refresh: () => void;
}

export function useLobby(): UseLobbyReturn {
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { account } = useStarknet();
  const sdkRef = useRef<Awaited<ReturnType<typeof init<DojoSchema>>> | null>(null);

  const loadTables = useCallback(async () => {
    try {
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

      // Fetch all tables
      const entities = await sdk.getEntities({
        query: new ToriiQueryBuilder<DojoSchema>()
          .withClause(KeysClause([TABLE_MODEL], []).build())
          .withLimit(100),
      });

      const items = entities.getItems();
      const parsed: TableData[] = [];
      for (const entity of items) {
        const models = entity.models?.[NAMESPACE] ?? {};
        const t = parseTable(models);
        if (t) parsed.push(t);
      }
      parsed.sort((a, b) => a.tableId - b.tableId);

      setTables(parsed);
      setError(null);
      setLoading(false);
    } catch (err) {
      setTables([]);
      setError(err instanceof Error ? err.message : "Failed to load tables.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
    const id = window.setInterval(loadTables, 3000);
    return () => window.clearInterval(id);
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
    ) => {
      const contractAddress = getSystemAddress("lobby");
      if (!account) {
        throw new Error("Connect your wallet before creating a table.");
      }
      if (!contractAddress) {
        throw new Error("Lobby system address is not configured.");
      }
      const shuffleVerifier = process.env.NEXT_PUBLIC_SHUFFLE_VERIFIER_ADDRESS || "0x0";
      const decryptVerifier = process.env.NEXT_PUBLIC_DECRYPT_VERIFIER_ADDRESS || "0x0";
      if (shuffleVerifier === "0x0" || decryptVerifier === "0x0") {
        throw new Error(
          "Missing verifier addresses. Set NEXT_PUBLIC_SHUFFLE_VERIFIER_ADDRESS and NEXT_PUBLIC_DECRYPT_VERIFIER_ADDRESS.",
        );
      }
      try {
        setError(null);
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
        await loadTables();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create table.";
        setError(message);
        throw new Error(message);
      }
    },
    [account, loadTables],
  );

  return { tables, loading, error, createTable, refresh: loadTables };
}
