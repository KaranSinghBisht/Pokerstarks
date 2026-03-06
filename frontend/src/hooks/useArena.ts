"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { init, ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import { WORLD_ADDRESS, TORII_URL, NAMESPACE } from "@/lib/dojo-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DojoSchema = any;

const AGENT_MODEL = `${NAMESPACE}-AgentProfile`;
const MATCH_MODEL = `${NAMESPACE}-ArenaMatch`;
const CHALLENGE_MODEL = `${NAMESPACE}-Challenge`;

export type AgentType = "Human" | "Bot" | "Agent";

export interface AgentProfile {
  agentId: number;
  owner: string;
  agentAddress: string;
  name: string;
  personality: string;
  agentType: AgentType;
  description: string;
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  totalChipsWon: bigint;
  totalChipsLost: bigint;
  isActive: boolean;
  autoPlay: boolean;
  registeredAt: number;
  erc8004Identity: string;
}

export interface AgentBankroll {
  agentId: number;
  depositedChips: bigint;
  reservedChips: bigint;
  minBalance: bigint;
  maxBuyIn: bigint;
  cooldownSeconds: number;
  lastMatchAt: number;
}

export interface ArenaMatch {
  matchId: number;
  tableId: number;
  status: string;
  winnerAgentId: number;
  numAgents: number;
  buyIn: bigint;
  createdAt: number;
  completedAt: number;
}

export interface MatchAgent {
  matchId: number;
  slotIndex: number;
  agentId: number;
  chipDelta: bigint;
}

export interface ArenaChallenge {
  challengeId: number;
  challengerAgentId: number;
  challengedAgentId: number;
  buyIn: bigint;
  status: string;
  createdAt: number;
  expiresAt: number;
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

function asAddr(v: unknown): string {
  if (!v) return "0x0";
  const s = String(v);
  if (s.startsWith("0x") || s.startsWith("0X")) {
    return "0x" + s.slice(2).replace(/^0+/, "").toLowerCase();
  }
  return "0x" + s.toLowerCase();
}

function asEnum(v: unknown, fallback: string): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>);
    if (keys.length > 0) return keys[0];
  }
  return fallback;
}

function feltToString(felt: unknown): string {
  if (!felt) return "";
  const hex = typeof felt === "bigint" ? felt.toString(16) : String(felt);
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (cleanHex === "0") return "";
  try {
    let str = "";
    for (let i = 0; i < cleanHex.length; i += 2) {
      const code = parseInt(cleanHex.substring(i, i + 2), 16);
      if (code > 0) str += String.fromCharCode(code);
    }
    return str;
  } catch {
    return cleanHex;
  }
}

function parseAgentType(v: unknown): AgentType {
  const e = asEnum(v, "Human");
  if (e === "Bot") return "Bot";
  if (e === "Agent") return "Agent";
  return "Human";
}

function parseAgent(models: Record<string, unknown>): AgentProfile | null {
  const a = (models["AgentProfile"] ?? models[AGENT_MODEL]) as Record<string, unknown> | undefined;
  if (!a) return null;
  return {
    agentId: asNum(a.agent_id),
    owner: asAddr(a.owner),
    agentAddress: asAddr(a.agent_address),
    name: feltToString(a.name),
    personality: feltToString(a.personality) || "gto",
    agentType: parseAgentType(a.agent_type),
    description: feltToString(a.description),
    eloRating: asNum(a.elo_rating),
    gamesPlayed: asNum(a.games_played),
    gamesWon: asNum(a.games_won),
    totalChipsWon: asBig(a.total_chips_won),
    totalChipsLost: asBig(a.total_chips_lost),
    isActive: asBool(a.is_active),
    autoPlay: asBool(a.auto_play),
    registeredAt: asNum(a.registered_at),
    erc8004Identity: asAddr(a.erc8004_identity),
  };
}

function parseMatch(models: Record<string, unknown>): ArenaMatch | null {
  const m = (models["ArenaMatch"] ?? models[MATCH_MODEL]) as Record<string, unknown> | undefined;
  if (!m) return null;
  return {
    matchId: asNum(m.match_id),
    tableId: asNum(m.table_id),
    status: asEnum(m.status, "Pending"),
    winnerAgentId: asNum(m.winner_agent_id),
    numAgents: asNum(m.num_agents),
    buyIn: asBig(m.buy_in),
    createdAt: asNum(m.created_at),
    completedAt: asNum(m.completed_at),
  };
}

function parseChallenge(models: Record<string, unknown>): ArenaChallenge | null {
  const c = (models["Challenge"] ?? models[CHALLENGE_MODEL]) as Record<string, unknown> | undefined;
  if (!c) return null;
  return {
    challengeId: asNum(c.challenge_id),
    challengerAgentId: asNum(c.challenger_agent_id),
    challengedAgentId: asNum(c.challenged_agent_id),
    buyIn: asBig(c.buy_in),
    status: asEnum(c.status, "Pending"),
    createdAt: asNum(c.created_at),
    expiresAt: asNum(c.expires_at),
  };
}

export interface UseArenaReturn {
  agents: AgentProfile[];
  matches: ArenaMatch[];
  challenges: ArenaChallenge[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useArena(): UseArenaReturn {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [matches, setMatches] = useState<ArenaMatch[]>([]);
  const [challenges, setChallenges] = useState<ArenaChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sdkRef = useRef<Awaited<ReturnType<typeof init<DojoSchema>>> | null>(null);

  const loadData = useCallback(async () => {
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

      // Fetch agents
      const agentEntities = await sdk.getEntities({
        query: new ToriiQueryBuilder<DojoSchema>()
          .withClause(KeysClause([AGENT_MODEL], []).build())
          .withLimit(100),
      });
      const agentItems = agentEntities.getItems();
      const parsedAgents: AgentProfile[] = [];
      for (const entity of agentItems) {
        const models = entity.models?.[NAMESPACE] ?? {};
        const a = parseAgent(models);
        if (a) parsedAgents.push(a);
      }
      parsedAgents.sort((a, b) => b.eloRating - a.eloRating);
      setAgents(parsedAgents);

      // Fetch matches
      const matchEntities = await sdk.getEntities({
        query: new ToriiQueryBuilder<DojoSchema>()
          .withClause(KeysClause([MATCH_MODEL], []).build())
          .withLimit(100),
      });
      const matchItems = matchEntities.getItems();
      const parsedMatches: ArenaMatch[] = [];
      for (const entity of matchItems) {
        const models = entity.models?.[NAMESPACE] ?? {};
        const m = parseMatch(models);
        if (m) parsedMatches.push(m);
      }
      parsedMatches.sort((a, b) => b.matchId - a.matchId);
      setMatches(parsedMatches);

      // Fetch challenges
      try {
        const challengeEntities = await sdk.getEntities({
          query: new ToriiQueryBuilder<DojoSchema>()
            .withClause(KeysClause([CHALLENGE_MODEL], []).build())
            .withLimit(50),
        });
        const challengeItems = challengeEntities.getItems();
        const parsedChallenges: ArenaChallenge[] = [];
        for (const entity of challengeItems) {
          const models = entity.models?.[NAMESPACE] ?? {};
          const c = parseChallenge(models);
          if (c) parsedChallenges.push(c);
        }
        parsedChallenges.sort((a, b) => b.challengeId - a.challengeId);
        setChallenges(parsedChallenges);
      } catch {
        // Challenges may not exist yet
      }

      setError(null);
    } catch (err) {
      console.error("[useArena] ERROR:", err);
      setError(err instanceof Error ? err.message : "Failed to load arena data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const id = window.setInterval(loadData, 5000);
    return () => window.clearInterval(id);
  }, [loadData]);

  return { agents, matches, challenges, loading, error, refresh: loadData };
}
