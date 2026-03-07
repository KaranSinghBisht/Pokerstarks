#!/usr/bin/env node
/**
 * Pokerstarks AI Bot — headless poker player.
 *
 * Runs the full mental poker protocol: key generation, shuffle + re-encryption
 * with ZK proofs, partial decryption tokens with ZK proofs, and betting.
 *
 * Usage:
 *   cd scripts/bot && npm install
 *   npx tsx index.ts --table 1 --seat 1 --private-key 0x... --address 0x...
 *
 * Options:
 *   --table         Table ID to join
 *   --seat          Seat index (0-5)
 *   --strategy        passive | aggressive | random | llm (default: passive)
 *   --personality     gto | bluffer | conservative (default: gto, llm only)
 *   --reasoning-port  HTTP port for LLM reasoning endpoint (default: disabled)
 *   --buy-in          Buy-in amount (default: table minimum)
 *   --private-key     Katana account private key
 *   --address         Katana account address
 *   --rpc-url         RPC URL (default: http://localhost:5050)
 *   --torii-url       Torii URL (default: http://localhost:8080)
 *   --world           World contract address (from manifest)
 *   --poll-ms         Poll interval in ms (default: 2000)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { hash } from "starknet";

import { BotChain, loadSystemAddresses } from "./chain.js";
import { StateReader, type GameState, type HandData, type PlayerHandData, type SeatData } from "./state.js";
import { generateProof } from "./prover.js";
import { decideBettingAction, type StrategyMode } from "./strategy.js";
import { decideLLMAction, startReasoningServer, type Personality } from "./llm-strategy.js";
import { log } from "./log.js";
import {
  computeAggregateKey,
  MentalPokerSession,
  serializeDeck,
  deserializeDeck,
  type Point,
} from "./frontend-shims.js";

// ───────────────────── Crypto imports (shared with frontend) ─────

const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

type MentalPokerSessionInstance = InstanceType<typeof MentalPokerSession>;

// ───────────────────── CLI Args ─────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

interface BotConfig {
  tableId: number;
  seatIndex: number;
  strategy: StrategyMode;
  personality: Personality;
  reasoningPort: number;
  buyIn: bigint;
  privateKey: string;
  address: string;
  rpcUrl: string;
  toriiUrl: string;
  worldAddress: string;
  pollMs: number;
  egsTokenId: string;
}

const HELP_TEXT = `Pokerstarks AI Bot — headless poker player

Usage:
  npx tsx index.ts --table <id> --seat <index> --private-key <hex> --address <hex> [options]

Required:
  --table         Table ID to join
  --seat          Seat index (0-5)
  --private-key   Katana account private key
  --address       Katana account address

Optional:
  --strategy        passive | aggressive | random | llm (default: passive)
  --personality     gto | bluffer | conservative (default: gto, only for --strategy llm)
  --reasoning-port  HTTP port to expose LLM reasoning (default: 0 = disabled)
  --buy-in          Buy-in amount (default: table minimum)
  --rpc-url         RPC URL (default: http://localhost:5050)
  --torii-url       Torii URL (default: http://localhost:8080)
  --world           World contract address (default: contracts/manifest_dev.json)
  --poll-ms         Poll interval in ms (default: 2000)
  --egs-token-id    EGS token ID for score tracking (default: disabled)
  -h, --help        Show this help message

Environment:
  ANTHROPIC_API_KEY  Required for --strategy llm
`;

const VALID_PERSONALITIES = new Set(["gto", "bluffer", "conservative"]);
function validatePersonality(value: string): Personality {
  if (VALID_PERSONALITIES.has(value)) return value as Personality;
  console.error(`Invalid --personality "${value}". Must be: gto, bluffer, conservative`);
  process.exit(1);
}

function parseArgs(): BotConfig {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  const get = (flag: string, fallback?: string): string => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    if (fallback !== undefined) return fallback;
    console.error(`Missing required arg: ${flag}`);
    process.exit(1);
  };

  // Try loading world address from manifest
  let worldAddress = get("--world", "");
  if (!worldAddress) {
    try {
      const manifestPath = resolve(__dirname, "../../contracts/manifest_dev.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      worldAddress = manifest.world?.address ?? "";
    } catch {
      // Fall through
    }
  }
  if (!worldAddress) {
    console.error("Missing --world or contracts/manifest_dev.json");
    process.exit(1);
  }

  return {
    tableId: parseInt(get("--table")),
    seatIndex: parseInt(get("--seat")),
    strategy: get("--strategy", "passive") as StrategyMode,
    personality: validatePersonality(get("--personality", "gto")),
    reasoningPort: parseInt(get("--reasoning-port", "0")),
    buyIn: BigInt(get("--buy-in", "0")),
    privateKey: get("--private-key"),
    address: get("--address"),
    rpcUrl: get("--rpc-url", "http://localhost:5050"),
    toriiUrl: get("--torii-url", "http://localhost:8080"),
    worldAddress,
    pollMs: parseInt(get("--poll-ms", "2000")),
    egsTokenId: get("--egs-token-id", ""),
  };
}

// ───────────────────── Phase Constants ─────────────────────

const Phase = {
  Setup: "Setup",
  Shuffling: "Shuffling",
  DealingPreflop: "DealingPreflop",
  BettingPreflop: "BettingPreflop",
  DealingFlop: "DealingFlop",
  BettingFlop: "BettingFlop",
  DealingTurn: "DealingTurn",
  BettingTurn: "BettingTurn",
  DealingRiver: "DealingRiver",
  BettingRiver: "BettingRiver",
  Showdown: "Showdown",
  Settling: "Settling",
} as const;

const DEALING_PHASES: Set<string> = new Set([
  Phase.DealingPreflop,
  Phase.DealingFlop,
  Phase.DealingTurn,
  Phase.DealingRiver,
]);

const BETTING_PHASES: Set<string> = new Set([
  Phase.BettingPreflop,
  Phase.BettingFlop,
  Phase.BettingTurn,
  Phase.BettingRiver,
]);

// ───────────────────── Bot State Machine ─────────────────────

class PokerBot {
  private config: BotConfig;
  private chain: BotChain;
  private state: StateReader;
  private session: MentalPokerSessionInstance | null = null;
  private sessionHandId = 0;
  private running = true;
  private lastSeenHandId = 0;
  private egsHandsPlayed = 0;

  // Guards — prevent duplicate actions
  private keySubmittedHand = 0;
  private aggKeySubmittedHand = 0;
  private deckHashSubmittedHand = 0;
  private deckSubmittedHand = 0;
  private shuffledHand = 0;
  private revealedPhases = new Set<string>();
  private bettingActedPhase = "";
  private showdownSubmitted = new Set<string>();
  private computeWinnerHand = 0;
  private distributePotHand = 0;
  private startHandGuard = "";
  private timeoutGuard = "";

  constructor(config: BotConfig) {
    this.config = config;
    const systems = loadSystemAddresses(
      resolve(__dirname, "../../contracts/manifest_dev.json"),
    );
    this.chain = new BotChain(config.rpcUrl, config.privateKey, config.address, systems);
    this.state = new StateReader(config.worldAddress, config.toriiUrl);
  }

  private deriveSessionSecret(handId: number): bigint {
    const digest = createHash("sha256")
      .update(`${this.config.privateKey}:${handId}:pokerstarks-bot-session`)
      .digest("hex");
    const raw = BigInt(`0x${digest}`);
    return (raw % (BN254_SCALAR_FIELD - 1n)) + 1n;
  }

  private resetForNewHand(handId: number) {
    this.lastSeenHandId = handId;
    this.session = null;
    this.sessionHandId = 0;
    this.keySubmittedHand = 0;
    this.aggKeySubmittedHand = 0;
    this.deckHashSubmittedHand = 0;
    this.deckSubmittedHand = 0;
    this.shuffledHand = 0;
    this.revealedPhases.clear();
    this.bettingActedPhase = "";
    this.showdownSubmitted.clear();
    this.computeWinnerHand = 0;
    this.distributePotHand = 0;
    this.timeoutGuard = "";
  }

  private ensureSessionForHand(handId: number): MentalPokerSessionInstance {
    if (this.session && this.sessionHandId === handId) {
      return this.session;
    }
    const secret = this.deriveSessionSecret(handId);
    this.session = MentalPokerSession.fromSecretKey(secret);
    this.sessionHandId = handId;
    return this.session;
  }

  private isAlreadySubmittedError(err: unknown): boolean {
    const msg =
      err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    return msg.includes("already voted") || msg.includes("token already submitted");
  }

  async run() {
    log.info("╔═══════════════════════════════════════╗");
    log.info("║    ♠ STARK POKER BOT — Online ♠       ║");
    log.info("╚═══════════════════════════════════════╝");
    log.info(`Table: ${this.config.tableId}  Seat: ${this.config.seatIndex}  Strategy: ${this.config.strategy}`);
    log.info(`Address: ${this.config.address.slice(0, 18)}...`);

    // Graceful shutdown
    const shutdown = () => {
      log.warn("Shutting down...");
      this.running = false;
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Main loop
    while (this.running) {
      try {
        const gs = await this.state.poll(this.config.tableId);
        await this.tick(gs);
      } catch (err) {
        log.error(`Tick error: ${err instanceof Error ? err.message : String(err)}`);
      }
      await sleep(this.config.pollMs);
    }

    // Complete EGS session on shutdown
    if (this.config.egsTokenId && this.egsHandsPlayed > 0) {
      try {
        const gs = await this.state.poll(this.config.tableId);
        const mySeatData = gs.seats.find(
          (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
        );
        const finalScore = mySeatData ? Number(mySeatData.chips) : 0;
        await this.chain.egsCompleteSession(this.config.egsTokenId, finalScore);
        log.info(`[EGS] Session completed: final_score=${finalScore}`);
      } catch (err) {
        log.warn(`[EGS] Failed to complete session: ${err instanceof Error ? err.message : err}`);
      }
    }

    log.info("Bot stopped.");
  }

  private async tick(gs: GameState) {
    const { table, seats, hand } = gs;
    if (!table) return;
    const mySeat = seats.find(
      (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
    );

    // ─── Join ───
    if (!mySeat) {
      if (table.state !== "Waiting") return;
      const buyIn = this.config.buyIn > 0n ? this.config.buyIn : table.minBuyIn;
      log.action(
        `Joining table ${this.config.tableId} at seat ${this.config.seatIndex} with ${buyIn} chips`,
      );
      await this.chain.joinTable(this.config.tableId, buyIn, this.config.seatIndex);
      return;
    }

    if (mySeat.isSittingOut) {
      return;
    }

    // ─── Ready for next hand ───
    if (table.state === "Waiting" && !mySeat.isReady) {
      log.action("Setting ready");
      await this.chain.setReady(this.config.tableId);
      return;
    }

    // ─── Start hand when table is in progress and previous hand is finalized ───
    if (table.state === "InProgress") {
      const canStart =
        !hand ||
        (hand.phase === Phase.Setup && hand.keysSubmitted === hand.numPlayers);

      if (canStart) {
        const sorted = [...seats]
          .filter((s) => s.isOccupied && !s.isSittingOut)
          .sort((a, b) => a.seatIndex - b.seatIndex);

        if (
          sorted.length >= 2 &&
          sorted[0].player.toLowerCase() === this.config.address.toLowerCase()
        ) {
          const startKey = `${table.currentHandId}-${hand?.phase ?? "none"}-${hand?.keysSubmitted ?? 0}`;
          if (this.startHandGuard !== startKey) {
            log.action("Starting new hand");
            await this.chain.startHand(this.config.tableId);
            this.startHandGuard = startKey;
          }
        }
        return;
      }
    }

    if (!hand) return;

    // New hand observed on-chain — reset per-hand execution guards.
    if (hand.handId !== this.lastSeenHandId) {
      this.resetForNewHand(hand.handId);
    }

    // Session is deterministic per (bot private key, hand id), so restart-safe.
    this.ensureSessionForHand(hand.handId);

    // ─── Timeout enforcement ───
    const nowSec = Math.floor(Date.now() / 1000);
    if (table.state === "InProgress" && nowSec > hand.phaseDeadline) {
      const timeoutKey = `${hand.handId}-${hand.phase}-${hand.phaseDeadline}`;
      if (this.timeoutGuard !== timeoutKey) {
        log.action("Enforcing timeout");
        await this.chain.enforceTimeout(hand.handId);
        this.timeoutGuard = timeoutKey;
      }
      return;
    }

    // ─── Phase Handlers ───
    const phase = hand.phase;

    if (phase === Phase.Setup) {
      await this.handleSetup(gs);
    } else if (phase === Phase.Shuffling) {
      await this.handleShuffling(gs);
    } else if (DEALING_PHASES.has(phase)) {
      await this.handleDealing(gs);
    } else if (BETTING_PHASES.has(phase)) {
      await this.handleBetting(gs);
    } else if (phase === Phase.Showdown) {
      await this.handleShowdown(gs);
    } else if (phase === Phase.Settling) {
      await this.handleSettling(gs);
    }
  }

  // ─── Key Setup Phase ───
  private async handleSetup(gs: GameState) {
    const hand = gs.hand!;
    if (this.keySubmittedHand === hand.handId) return;

    const myPh = gs.playerHands.find(
      (ph) => ph.player.toLowerCase() === this.config.address.toLowerCase(),
    );
    if (myPh && myPh.publicKeyX !== "0") {
      this.keySubmittedHand = hand.handId;
      return;
    }

    const session = this.ensureSessionForHand(hand.handId);

    log.phase(`Hand #${hand.handId} — Setup`);
    log.action("Submitting public key");
    await this.chain.submitPublicKey(
      hand.handId,
      session.publicKey.x.toString(),
      session.publicKey.y.toString(),
    );
    this.keySubmittedHand = hand.handId;
  }

  // ─── Shuffling Phase ───
  private async handleShuffling(gs: GameState) {
    const hand = gs.hand!;
    const session = this.ensureSessionForHand(hand.handId);

    // Step A: Submit aggregate key if needed
    if (this.aggKeySubmittedHand !== hand.handId && hand.aggPubKeyX === "0") {
      const keys: Point[] = [];
      for (const ph of gs.playerHands) {
        if (ph.player && ph.player !== "0x0" && ph.publicKeyX && ph.publicKeyX !== "0") {
          keys.push({ x: BigInt(ph.publicKeyX), y: BigInt(ph.publicKeyY) });
        }
      }
      if (keys.length >= hand.numPlayers) {
        const aggKey = computeAggregateKey(keys);
        session.setAggregateKey(keys);
        log.action("Submitting aggregate key");
        await this.chain.submitAggregateKey(hand.handId, aggKey.x.toString(), aggKey.y.toString());
        this.aggKeySubmittedHand = hand.handId;
      }
      return;
    }

    // Ensure session has aggregate key set
    if (!session.getAggregateKey() && hand.aggPubKeyX !== "0") {
      const keys: Point[] = gs.playerHands
        .filter((ph) => ph.publicKeyX && ph.publicKeyX !== "0")
        .map((ph) => ({ x: BigInt(ph.publicKeyX), y: BigInt(ph.publicKeyY) }));
      if (keys.length > 0) session.setAggregateKey(keys);
    }

    // Step B: Submit deck hash
    if (this.deckHashSubmittedHand !== hand.handId && hand.aggPubKeyX !== "0" && hand.deckSeed && hand.deckSeed !== "0") {
      const seed = BigInt(hand.deckSeed);
      const deck = session.generateInitialDeck(seed);
      const serialized = serializeDeck(deck);
      const deckHash = hash.computePoseidonHashOnElements(serialized);
      log.action("Submitting deck hash");
      await this.chain.submitInitialDeckHash(hand.handId, deckHash);
      this.deckHashSubmittedHand = hand.handId;
      return;
    }

    // Step C: Submit initial deck
    if (this.deckSubmittedHand !== hand.handId && hand.initialDeckHash && hand.initialDeckHash !== "0" && hand.deckSeed && hand.deckSeed !== "0") {
      const seed = BigInt(hand.deckSeed);
      const deck = session.generateInitialDeck(seed);
      const serialized = serializeDeck(deck);
      log.action("Submitting initial deck");
      await this.chain.submitInitialDeck(hand.handId, serialized);
      this.deckSubmittedHand = hand.handId;
      return;
    }

    // Step D: Shuffle when it's our turn
    if (this.shuffledHand === hand.handId) return;
    if (!gs.currentDeck?.cards?.length) return;

    const occupiedSeats = gs.seats
      .filter((s) => s.isOccupied && !s.isSittingOut)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    const myOccupiedIndex = occupiedSeats.findIndex(
      (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
    );
    if (myOccupiedIndex !== hand.shuffleProgress) return;

    log.phase("My turn to shuffle!");

    const inputDeck = deserializeDeck(gs.currentDeck.cards);
    const { serializedDeck, proofInputs } = session.shuffleDeck(inputDeck);

    log.action("Generating shuffle proof...");
    const proof = await generateProof("shuffle", proofInputs);

    log.action("Submitting shuffled deck + proof");
    await this.chain.submitShuffle(hand.handId, serializedDeck, proof);
    this.shuffledHand = hand.handId;
  }

  // ─── Dealing Phase ───
  private async handleDealing(gs: GameState) {
    const hand = gs.hand!;
    const phaseKey = `${hand.handId}-${hand.phase}`;
    if (this.revealedPhases.has(phaseKey)) return;
    if (!gs.currentDeck?.cards?.length) return;

    const mySeat = gs.seats.find(
      (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
    );
    if (!mySeat) return;

    const session = this.ensureSessionForHand(hand.handId);
    session.loadDeck(gs.currentDeck.cards);
    log.phase(`Dealing — ${hand.phase}`);

    // Determine card positions to reveal
    const positions = this.getPositionsForPhase(hand.phase, mySeat.seatIndex, gs);

    for (const pos of positions) {
      const alreadySubmitted = gs.revealTokens.some(
        (t) =>
          t.handId === hand.handId &&
          t.cardPosition === pos &&
          t.playerSeat === mySeat.seatIndex &&
          t.proofVerified,
      );
      if (alreadySubmitted) continue;

      const { token, proofInputs } = session.computeRevealTokenForCard(pos);

      log.action(`Generating decrypt proof for card position ${pos}...`);
      const proof = await generateProof("decrypt", proofInputs);

      await this.chain.submitRevealToken(
        hand.handId,
        pos,
        token.x.toString(),
        token.y.toString(),
        proof,
      );
    }

    this.revealedPhases.add(phaseKey);
  }

  private getPositionsForPhase(phase: string, mySeatIndex: number, gs: GameState): number[] {
    const positions: number[] = [];

    if (phase === Phase.DealingPreflop) {
      // Submit reveal tokens for OTHER players' hole cards
      for (const ph of gs.playerHands) {
        if (ph.seatIndex === mySeatIndex) continue;
        if (!ph.player || ph.player === "0x0") continue;
        positions.push(ph.holeCard1Pos, ph.holeCard2Pos);
      }
    } else if (phase === Phase.DealingFlop && gs.communityCards) {
      positions.push(gs.communityCards.flop1Pos, gs.communityCards.flop2Pos, gs.communityCards.flop3Pos);
    } else if (phase === Phase.DealingTurn && gs.communityCards) {
      positions.push(gs.communityCards.turnPos);
    } else if (phase === Phase.DealingRiver && gs.communityCards) {
      positions.push(gs.communityCards.riverPos);
    }

    return positions;
  }

  // ─── Betting Phase ───
  private async handleBetting(gs: GameState) {
    const hand = gs.hand!;
    const phaseKey = `${hand.handId}-${hand.phase}`;
    if (this.bettingActedPhase === phaseKey) return;

    const mySeat = gs.seats.find(
      (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
    );
    if (!mySeat) return;

    // Only act when it's our turn
    if (hand.currentTurnSeat !== mySeat.seatIndex) return;

    const myPH = gs.playerHands.find(
      (ph) => ph.player.toLowerCase() === this.config.address.toLowerCase(),
    );
    if (!myPH || myPH.hasFolded || myPH.isAllIn) return;

    log.phase(`Betting — ${hand.phase} (my turn)`);

    let decision;
    if (this.config.strategy === "llm") {
      decision = await decideLLMAction(hand, myPH, mySeat, gs, this.config.personality);
    } else {
      decision = decideBettingAction(this.config.strategy, hand, myPH, mySeat);
    }
    log.action(`Decision: ${decision.label}`);
    await this.chain.playerAction(hand.handId, decision.action, decision.amount);
    this.bettingActedPhase = phaseKey;
  }

  // ─── Showdown Phase ───
  private async handleShowdown(gs: GameState) {
    const hand = gs.hand!;
    if (!gs.currentDeck?.cards?.length) return;

    const mySeat = gs.seats.find(
      (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
    );
    if (!mySeat) return;

    const session = this.ensureSessionForHand(hand.handId);
    session.loadDeck(gs.currentDeck.cards);

    const myPH = gs.playerHands.find(
      (ph) => ph.player.toLowerCase() === this.config.address.toLowerCase(),
    );

    // Submit card decryptions for community cards + own hole cards
    const positions: Array<{ pos: number; isCommunity: boolean }> = [];

    if (gs.communityCards) {
      positions.push(
        { pos: gs.communityCards.flop1Pos, isCommunity: true },
        { pos: gs.communityCards.flop2Pos, isCommunity: true },
        { pos: gs.communityCards.flop3Pos, isCommunity: true },
        { pos: gs.communityCards.turnPos, isCommunity: true },
        { pos: gs.communityCards.riverPos, isCommunity: true },
      );
    }

    if (myPH && !myPH.hasFolded && myPH.player && myPH.player !== "0x0") {
      positions.push(
        { pos: myPH.holeCard1Pos, isCommunity: false },
        { pos: myPH.holeCard2Pos, isCommunity: false },
      );
    }

    for (const { pos, isCommunity } of positions) {
      const key = `${hand.handId}-${pos}`;
      const alreadyVotedOnChain = gs.cardVotes.some(
        (v) =>
          v.handId === hand.handId &&
          v.cardPosition === pos &&
          v.voterSeat === mySeat.seatIndex &&
          v.submitted,
      );
      if (alreadyVotedOnChain) {
        this.showdownSubmitted.add(key);
        continue;
      }
      if (this.showdownSubmitted.has(key)) continue;

      const tokensForPos = gs.revealTokens.filter(
        (t) => t.handId === hand.handId && t.cardPosition === pos && t.proofVerified,
      );

      const required = isCommunity ? hand.numPlayers : (hand.numPlayers > 0 ? hand.numPlayers - 1 : 0);
      if (tokensForPos.length < required) continue;

      const includeOwnToken = !isCommunity;
      const tokens = tokensForPos.map((t) => ({
        x: BigInt(t.tokenX),
        y: BigInt(t.tokenY),
      }));

      const cardId = session.decryptCard(pos, tokens, includeOwnToken);
      if (cardId < 0) continue;

      log.action(`Decrypting card at position ${pos} → card #${cardId}`);
      try {
        await this.chain.submitCardDecryption(hand.handId, pos, cardId);
      } catch (err) {
        if (!this.isAlreadySubmittedError(err)) throw err;
      }
      this.showdownSubmitted.add(key);
    }

    // Compute winner if we're the leader
    if (this.computeWinnerHand !== hand.handId) {
      const CARD_NOT_DEALT = 255;
      if (
        gs.communityCards &&
        gs.communityCards.flop1 !== CARD_NOT_DEALT &&
        gs.communityCards.flop2 !== CARD_NOT_DEALT &&
        gs.communityCards.flop3 !== CARD_NOT_DEALT &&
        gs.communityCards.turn !== CARD_NOT_DEALT &&
        gs.communityCards.river !== CARD_NOT_DEALT
      ) {
        const activePlayers = gs.playerHands.filter(
          (ph) => ph.player && ph.player !== "0x0" && !ph.hasFolded,
        );
        const allRevealed = activePlayers.every(
          (ph) => ph.holeCard1Id !== CARD_NOT_DEALT && ph.holeCard2Id !== CARD_NOT_DEALT,
        );

        if (allRevealed && activePlayers.length > 0) {
          const leader = [...activePlayers].sort((a, b) => a.seatIndex - b.seatIndex)[0];
          if (leader.seatIndex === mySeat.seatIndex) {
            log.action("Computing winner");
            await this.chain.computeWinner(hand.handId);
            this.computeWinnerHand = hand.handId;
          }
        }
      }
    }
  }

  // ─── Settling Phase ───
  private async handleSettling(gs: GameState) {
    const hand = gs.hand!;
    if (this.distributePotHand === hand.handId) return;

    const sorted = [...gs.seats]
      .filter((s) => s.isOccupied)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    if (sorted.length === 0) return;
    if (sorted[0].player.toLowerCase() !== this.config.address.toLowerCase()) return;

    log.action("Distributing pot");
    await this.chain.distributePot(hand.handId);
    this.distributePotHand = hand.handId;

    // Update EGS score after pot distribution
    if (this.config.egsTokenId) {
      this.egsHandsPlayed += 1;
      try {
        const mySeatData = gs.seats.find(
          (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
        );
        const chipCount = mySeatData ? Number(mySeatData.chips) : 0;
        await this.chain.egsUpdateScore(this.config.egsTokenId, this.egsHandsPlayed, chipCount);
        log.info(`[EGS] Updated score: hands=${this.egsHandsPlayed}, chips=${chipCount}`);
      } catch (err) {
        log.warn(`[EGS] Score update failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}

// ───────────────────── Helpers ─────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ───────────────────── Entry Point ─────────────────────

const config = parseArgs();
if (config.strategy === "llm" && config.reasoningPort > 0) {
  startReasoningServer(config.reasoningPort);
}
const bot = new PokerBot(config);
bot.run().catch((err) => {
  log.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
