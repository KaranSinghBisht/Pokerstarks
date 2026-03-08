#!/usr/bin/env node
/**
 * Arena Matchmaker — orchestrates agent-vs-agent matches.
 *
 * Modes:
 *   --mode manual    One-shot: create match with specified agent IDs
 *   --mode auto      Loop: pair available agents every N seconds
 *   --mode challenge Watch for accepted challenges, create matches
 *
 * Usage:
 *   npx tsx matchmaker.ts --mode manual --agents 0,1 --buy-in 500
 *   npx tsx matchmaker.ts --mode auto --interval 120
 *
 * Options:
 *   --mode            manual | auto | challenge (default: manual)
 *   --agents          Comma-separated agent IDs (manual mode only)
 *   --buy-in          Buy-in per agent (default: 500)
 *   --interval        Seconds between auto-match attempts (default: 120)
 *   --table           Existing table ID to use (default: creates new)
 *   --min-agents      Minimum agents for auto mode (default: 2)
 *   --reasoning-port  Port for multi-agent reasoning server (default: 3001)
 *   --egs             Enable EGS token minting/scoring (default: off, or EGS_ENABLED=true)
 *   --rpc-url         RPC URL (default: http://localhost:5050)
 *   --torii-url       Torii URL (default: http://localhost:8080)
 *   --world           World contract address
 *   --private-key     Matchmaker account private key
 *   --address         Matchmaker account address
 *
 * Env:
 *   ANTHROPIC_API_KEY  Required for LLM-powered agents
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { fork, type ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { init, ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import { Account, RpcProvider, CallData } from "starknet";
import { log } from "./log.js";
import { loadSystemAddresses } from "./chain.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DojoSchema = any;

// ───────────────────── Config ─────────────────────

interface MatchmakerConfig {
  mode: "manual" | "auto" | "challenge";
  agentIds: number[];
  buyIn: number;
  interval: number;
  tableId: number;
  minAgents: number;
  reasoningPort: number;
  rpcUrl: string;
  toriiUrl: string;
  worldAddress: string;
  privateKey: string;
  address: string;
  egsEnabled: boolean;
}

function parseArgs(): MatchmakerConfig {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string): string => {
    const idx = args.indexOf(`--${flag}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
  };

  const mode = get("mode", "manual") as MatchmakerConfig["mode"];
  const agentStr = get("agents", "");
  const agentIds = agentStr ? agentStr.split(",").map(Number) : [];

  return {
    mode,
    agentIds,
    buyIn: Number(get("buy-in", "500")),
    interval: Number(get("interval", "120")),
    tableId: Number(get("table", "0")),
    minAgents: Number(get("min-agents", "2")),
    reasoningPort: Number(get("reasoning-port", "3001")),
    rpcUrl: get("rpc-url", process.env.RPC_URL ?? "http://localhost:5050"),
    toriiUrl: get("torii-url", process.env.TORII_URL ?? "http://localhost:8080"),
    worldAddress: get("world", process.env.WORLD_ADDRESS ?? ""),
    privateKey: get("private-key", process.env.PRIVATE_KEY ?? ""),
    address: get("address", process.env.ACCOUNT_ADDRESS ?? ""),
    egsEnabled: args.includes("--egs") || process.env.EGS_ENABLED === "true",
  };
}

// ───────────────────── Multi-Agent Reasoning Server ─────────────────────

interface ReasoningEntry {
  agentId: number;
  agentName: string;
  personality: string;
  reasoning: string;
  action: string;
  timestamp: number;
}

const reasoningStore = new Map<number, ReasoningEntry>();
const reasoningHistory: ReasoningEntry[] = [];

function startReasoningAggregator(port: number) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // POST /reasoning — bots send their reasoning here
    if (req.method === "POST" && req.url === "/reasoning") {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        try {
          const entry = JSON.parse(body) as ReasoningEntry;
          entry.timestamp = Date.now();
          reasoningStore.set(entry.agentId, entry);
          reasoningHistory.push(entry);
          // Keep last 200 entries
          if (reasoningHistory.length > 200) reasoningHistory.splice(0, reasoningHistory.length - 200);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400);
          res.end("invalid json");
        }
      });
      return;
    }

    // GET /reasoning — frontend gets all agents' latest reasoning
    if (req.method === "GET" && req.url === "/reasoning") {
      const agents: Record<string, ReasoningEntry> = {};
      for (const [id, entry] of reasoningStore) {
        agents[String(id)] = entry;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ agents, history: reasoningHistory.slice(-50) }));
      return;
    }

    // GET /reasoning/:agentId — single agent's reasoning
    const match = req.url?.match(/^\/reasoning\/(\d+)$/);
    if (req.method === "GET" && match) {
      const agentId = Number(match[1]);
      const entry = reasoningStore.get(agentId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(entry ?? { reasoning: "No decision yet", action: "", timestamp: 0 }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, () => {
    log.info(`Reasoning aggregator listening on port ${port}`);
  });

  return server;
}

// ───────────────────── Torii Agent Fetcher ─────────────────────

interface AgentData {
  agentId: number;
  agentAddress: string;
  name: string;
  personality: string;
  eloRating: number;
  isActive: boolean;
  autoPlay: boolean;
  depositedChips: number;
  reservedChips: number;
  minBalance: number;
  maxBuyIn: number;
  cooldownSeconds: number;
  lastMatchAt: number;
}

const NAMESPACE = "pokerstarks";
const AGENT_MODEL = `${NAMESPACE}-AgentProfile`;
const BANKROLL_MODEL = `${NAMESPACE}-AgentBankroll`;
const EGS_COUNTER_MODEL = `${NAMESPACE}-GameTokenCounter`;

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

let cachedSdk: Awaited<ReturnType<typeof init<DojoSchema>>> | null = null;

async function fetchAvailableAgents(toriiUrl: string, worldAddress: string): Promise<AgentData[]> {
  if (!cachedSdk) {
    cachedSdk = await init<DojoSchema>({
      client: { worldAddress, toriiUrl },
      domain: { name: "STARK POKER", version: "1.0.0", chainId: "SN_SEPOLIA" },
    });
  }
  const sdk = cachedSdk;

  const agentEntities = await sdk.getEntities({
    query: new ToriiQueryBuilder<DojoSchema>()
      .withClause(KeysClause([AGENT_MODEL], []).build())
      .withLimit(100),
  });

  const agents: AgentData[] = [];

  for (const entity of agentEntities.getItems()) {
    const models = entity.models?.[NAMESPACE] ?? {};
    const a = (models["AgentProfile"] ?? models[AGENT_MODEL]) as Record<string, unknown> | undefined;
    if (!a) continue;

    // Try to fetch bankroll too
    const b = (models["AgentBankroll"] ?? models[BANKROLL_MODEL]) as Record<string, unknown> | undefined;

    agents.push({
      agentId: Number(a.agent_id ?? 0),
      agentAddress: String(a.agent_address ?? "0x0"),
      name: feltToString(a.name),
      personality: feltToString(a.personality) || "gto",
      eloRating: Number(a.elo_rating ?? 1000),
      isActive: Boolean(a.is_active),
      autoPlay: Boolean(a.auto_play),
      depositedChips: Number(b?.deposited_chips ?? 0),
      reservedChips: Number(b?.reserved_chips ?? 0),
      minBalance: Number(b?.min_balance ?? 0),
      maxBuyIn: Number(b?.max_buy_in ?? 0),
      cooldownSeconds: Number(b?.cooldown_seconds ?? 60),
      lastMatchAt: Number(b?.last_match_at ?? 0),
    });
  }

  return agents;
}

async function fetchEgsNextId(toriiUrl: string, worldAddress: string): Promise<bigint> {
  if (!cachedSdk) {
    cachedSdk = await init<DojoSchema>({
      client: { worldAddress, toriiUrl },
      domain: { name: "STARK POKER", version: "1.0.0", chainId: "SN_SEPOLIA" },
    });
  }
  try {
    const entities = await cachedSdk.getEntities({
      query: new ToriiQueryBuilder<DojoSchema>()
        .withClause(KeysClause([EGS_COUNTER_MODEL], []).build())
        .withLimit(1),
    });
    for (const entity of entities.getItems()) {
      const models = entity.models?.[NAMESPACE] ?? {};
      const c = (models["GameTokenCounter"] ?? models[EGS_COUNTER_MODEL]) as Record<string, unknown> | undefined;
      if (c && c.next_id != null) return BigInt(String(c.next_id));
    }
  } catch {
    // Counter may not exist yet (first mint)
  }
  return 0n;
}

function filterAvailableAgents(agents: AgentData[], buyIn: number, now: number): AgentData[] {
  return agents.filter((a) => {
    if (!a.isActive) return false;
    if (!a.autoPlay) return false;
    const available = a.depositedChips - a.reservedChips;
    if (available < buyIn) return false;
    if (a.maxBuyIn > 0 && buyIn > a.maxBuyIn) return false;
    if (a.lastMatchAt > 0 && now < a.lastMatchAt + a.cooldownSeconds) return false;
    return true;
  });
}

// ───────────────────── Bot Process Manager ─────────────────────

const botProcesses = new Map<number, ChildProcess>();

interface SpawnBotOptions {
  agentId: number;
  tableId: number;
  seatIndex: number;
  personality: string;
  privateKey: string;
  address: string;
  rpcUrl: string;
  toriiUrl: string;
  worldAddress: string;
  reasoningPort: number;
  egsTokenId: string;
}

// L3: Currently unused but retained for future challenge mode auto-spawn
function spawnBot(opts: SpawnBotOptions): ChildProcess {
  const botScript = resolve(__dirname, "index.ts");
  const args = [
    botScript,
    "--table", String(opts.tableId),
    "--seat", String(opts.seatIndex),
    "--strategy", "llm",
    "--personality", opts.personality,
    "--reasoning-port", String(opts.reasoningPort),
    "--private-key", opts.privateKey,
    "--address", opts.address,
    "--rpc-url", opts.rpcUrl,
    "--torii-url", opts.toriiUrl,
    "--world", opts.worldAddress,
    ...(opts.egsTokenId ? ["--egs-token-id", opts.egsTokenId] : []),
  ];

  const child = fork(botScript, args.slice(1), {
    execArgv: ["--import", "tsx"],
    stdio: "pipe",
    env: {
      ...process.env,
      REASONING_AGGREGATOR_URL: `http://localhost:${opts.reasoningPort}`,
      AGENT_ID: String(opts.agentId),
      AGENT_NAME: `Agent#${opts.agentId}`,
    },
  });

  child.stdout?.on("data", (data: Buffer) => {
    log.info(`[Agent#${opts.agentId}] ${data.toString().trim()}`);
  });

  child.stderr?.on("data", (data: Buffer) => {
    log.warn(`[Agent#${opts.agentId}] ${data.toString().trim()}`);
  });

  child.on("exit", (code) => {
    log.info(`[Agent#${opts.agentId}] exited with code ${code}`);
    botProcesses.delete(opts.agentId);
  });

  botProcesses.set(opts.agentId, child);
  return child;
}

function killAllBots() {
  for (const [id, proc] of botProcesses) {
    log.info(`Killing bot process for Agent#${id}`);
    proc.kill("SIGTERM");
  }
  botProcesses.clear();
}

// ───────────────────── Elo Bracket Matching ─────────────────────

function matchByEloBracket(agents: AgentData[], count: number, eloRange: number = 200): AgentData[] {
  if (agents.length < count) return [];

  // Sort by Elo
  const sorted = [...agents].sort((a, b) => a.eloRating - b.eloRating);

  // Try to find a group of `count` agents within eloRange
  for (let i = 0; i <= sorted.length - count; i++) {
    const group = sorted.slice(i, i + count);
    const spread = group[group.length - 1].eloRating - group[0].eloRating;
    if (spread <= eloRange) return group;
  }

  // Fallback: just take the first `count` agents (widen bracket)
  return sorted.slice(0, count);
}

// ───────────────────── Main ─────────────────────

async function main() {
  const config = parseArgs();

  if (!config.privateKey || !config.address) {
    console.error("Error: --private-key and --address are required");
    process.exit(1);
  }

  log.info(`Arena Matchmaker — mode: ${config.mode}`);

  // Start reasoning aggregator
  startReasoningAggregator(config.reasoningPort);

  // Setup account for on-chain calls
  const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
  const account = new Account({ provider, address: config.address, signer: config.privateKey });
  const systems = loadSystemAddresses();

  const arenaAddress = process.env.ARENA_ADDRESS ?? systems.arena ?? systems.lobby;
  const egsAddress = process.env.EGS_ADDRESS ?? systems.egs ?? "";

  // Helper to call arena system
  async function callArena(entrypoint: string, calldata: (string | number | bigint)[]) {
    const result = await account.execute({
      contractAddress: arenaAddress,
      entrypoint,
      calldata: CallData.compile(calldata.map(String)),
    });
    log.tx(entrypoint, result.transaction_hash);
    return result;
  }

  // Helper to call EGS system
  async function callEgs(entrypoint: string, calldata: (string | number | bigint)[]) {
    if (!egsAddress) throw new Error("EGS system address not configured");
    const result = await account.execute({
      contractAddress: egsAddress,
      entrypoint,
      calldata: CallData.compile(calldata.map(String)),
    });
    log.tx(`egs.${entrypoint}`, result.transaction_hash);
    return result;
  }

  // EGS token tracking per match
  const egsTokens = new Map<string, string[]>(); // matchKey -> token_ids

  async function mintEgsTokens(
    agents: Array<{ agentId: number; agentAddress: string }>,
    tableId: number,
  ): Promise<string[]> {
    if (!config.egsEnabled || !egsAddress) return [];

    let nextId: bigint;
    try {
      nextId = await fetchEgsNextId(config.toriiUrl, config.worldAddress);
      if (nextId === 0n) nextId = 1n;
    } catch {
      nextId = 1n;
    }

    const tokenIds: string[] = [];
    for (let i = 0; i < agents.length; i++) {
      const { agentId, agentAddress } = agents[i];
      try {
        const agentName = `0x${Buffer.from(`Agent#${agentId}`).toString("hex")}`;
        // Pass bot's agent_address as token owner so the bot can update scores
        await callEgs("mint", [agentAddress, tableId, agentName]);
        const predictedTokenId = String(nextId + BigInt(i));
        log.info(`[EGS] Minted token ${predictedTokenId} for Agent#${agentId} (owner: ${agentAddress})`);
        tokenIds.push(predictedTokenId);
      } catch (err) {
        log.warn(`[EGS] Failed to mint for Agent#${agentId}: ${err instanceof Error ? err.message : err}`);
        tokenIds.push(""); // placeholder so indices stay aligned
      }
    }
    return tokenIds;
  }

  if (config.mode === "manual") {
    if (config.agentIds.length < 2) {
      console.error("Error: --agents must specify at least 2 agent IDs (e.g., --agents 0,1)");
      process.exit(1);
    }

    log.info(`Manual match: agents [${config.agentIds.join(", ")}], buy-in: ${config.buyIn}`);

    // Create arena match on-chain
    try {
      await callArena("create_arena_match", [
        config.tableId,
        config.agentIds.length,
        ...config.agentIds,
        config.buyIn,
      ]);
      log.info("Arena match created on-chain");
    } catch (err: unknown) {
      log.warn(`Failed to create on-chain match (may already exist): ${err instanceof Error ? err.message : err}`);
    }

    // Mint EGS tokens for each agent
    if (config.egsEnabled) {
      // Fetch agent profiles to get addresses for EGS token ownership
      const allAgents = await fetchAvailableAgents(config.toriiUrl, config.worldAddress);
      const agentObjs = config.agentIds.map((id) => {
        const found = allAgents.find((a) => a.agentId === id);
        return { agentId: id, agentAddress: found?.agentAddress ?? "0x0" };
      });
      const tokens = await mintEgsTokens(agentObjs, config.tableId);
      if (tokens.length > 0) {
        egsTokens.set(`manual-${config.tableId}`, tokens);
        log.info(`[EGS] Minted ${tokens.length} tokens for match`);
      }
    }

    log.info("Match started. Bots will play via the existing bot process.");
    log.info(`Reasoning available at http://localhost:${config.reasoningPort}/reasoning`);

    // Keep alive for reasoning server
    process.on("SIGINT", () => {
      killAllBots();
      process.exit(0);
    });

  } else if (config.mode === "auto") {
    log.info(`Auto mode: checking every ${config.interval}s, min ${config.minAgents} agents, buy-in: ${config.buyIn}`);

    const runAutoMatch = async () => {
      try {
        const allAgents = await fetchAvailableAgents(config.toriiUrl, config.worldAddress);
        const now = Math.floor(Date.now() / 1000);
        const available = filterAvailableAgents(allAgents, config.buyIn, now);

        log.info(`Available agents: ${available.length}/${allAgents.length}`);

        if (available.length < config.minAgents) {
          log.info("Not enough available agents, waiting...");
          return;
        }

        // Match by Elo bracket
        const matched = matchByEloBracket(available, config.minAgents);
        if (matched.length < config.minAgents) {
          log.info("Could not form Elo bracket, waiting...");
          return;
        }

        const agentIds = matched.map((a) => a.agentId);
        log.info(`Matched agents: ${matched.map((a) => `${a.name}(${a.eloRating})`).join(" vs ")}`);

        // Create match on-chain
        await callArena("create_arena_match", [
          0, // table_id = 0 (auto-create)
          agentIds.length,
          ...agentIds,
          config.buyIn,
        ]);

        log.info("Auto match created on-chain");

        // Mint EGS tokens
        if (config.egsEnabled) {
          const agentObjs = matched.map((a) => ({
            agentId: a.agentId,
            agentAddress: a.agentAddress,
          }));
          const tokens = await mintEgsTokens(agentObjs, 0);
          if (tokens.length > 0) {
            egsTokens.set(`auto-${Date.now()}`, tokens);
            log.info(`[EGS] Minted ${tokens.length} tokens for auto match`);
          }
        }
      } catch (err: unknown) {
        log.warn(`Auto match error: ${err instanceof Error ? err.message : err}`);
      }
    };

    // Initial run + interval
    await runAutoMatch();
    setInterval(runAutoMatch, config.interval * 1000);

    process.on("SIGINT", () => {
      killAllBots();
      process.exit(0);
    });

  } else if (config.mode === "challenge") {
    log.info("Challenge mode: watching for accepted challenges...");
    // TODO: Poll Torii for Challenge entities with status=Accepted, create matches
    log.info("Challenge watching not yet implemented — use manual mode for now");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
