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
 *   --strategy      passive | aggressive | random (default: passive)
 *   --buy-in        Buy-in amount (default: table minimum)
 *   --private-key   Katana account private key
 *   --address       Katana account address
 *   --rpc-url       RPC URL (default: http://localhost:5050)
 *   --torii-url     Torii URL (default: http://localhost:8080)
 *   --world         World contract address (from manifest)
 *   --poll-ms       Poll interval in ms (default: 2000)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { hash } from "starknet";

import { BotChain, loadSystemAddresses } from "./chain.js";
import { StateReader, type GameState, type HandData, type PlayerHandData, type SeatData } from "./state.js";
import { generateProof } from "./prover.js";
import { decideBettingAction, type StrategyMode } from "./strategy.js";
import { log } from "./log.js";

// ───────────────────── Crypto imports (shared with frontend) ─────

// These are pure TypeScript — no browser deps
import {
  computeAggregateKey,
  type Point,
} from "../../frontend/src/lib/cards/elgamal.js";

import { MentalPokerSession } from "../../frontend/src/lib/cards/mental-poker.js";

import {
  serializeDeck,
  deserializeDeck,
} from "../../frontend/src/lib/noir/shuffle.js";

import {
  computeRevealToken,
  prepareDecryptProofInputs,
} from "../../frontend/src/lib/noir/decrypt.js";

// ───────────────────── CLI Args ─────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

interface BotConfig {
  tableId: number;
  seatIndex: number;
  strategy: StrategyMode;
  buyIn: bigint;
  privateKey: string;
  address: string;
  rpcUrl: string;
  toriiUrl: string;
  worldAddress: string;
  pollMs: number;
}

function parseArgs(): BotConfig {
  const args = process.argv.slice(2);
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
    buyIn: BigInt(get("--buy-in", "0")),
    privateKey: get("--private-key"),
    address: get("--address"),
    rpcUrl: get("--rpc-url", "http://localhost:5050"),
    toriiUrl: get("--torii-url", "http://localhost:8080"),
    worldAddress,
    pollMs: parseInt(get("--poll-ms", "2000")),
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
  private session: MentalPokerSession | null = null;
  private running = true;

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
  private startHandGuard = 0;
  private joined = false;
  private readied = false;

  constructor(config: BotConfig) {
    this.config = config;
    const systems = loadSystemAddresses(
      resolve(__dirname, "../../contracts/manifest_dev.json"),
    );
    this.chain = new BotChain(config.rpcUrl, config.privateKey, config.address, systems);
    this.state = new StateReader(config.worldAddress, config.toriiUrl);
  }

  async run() {
    log.info("╔═══════════════════════════════════════╗");
    log.info("║    ♠ STARK POKER BOT — Online ♠       ║");
    log.info("╚═══════════════════════════════════════╝");
    log.info(`Table: ${this.config.tableId}  Seat: ${this.config.seatIndex}  Strategy: ${this.config.strategy}`);
    log.info(`Address: ${this.config.address.slice(0, 18)}...`);

    // Graceful shutdown
    process.on("SIGINT", () => {
      log.warn("Shutting down...");
      this.running = false;
    });
    process.on("SIGTERM", () => {
      this.running = false;
    });

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

    log.info("Bot stopped.");
  }

  private async tick(gs: GameState) {
    const { table, seats, hand } = gs;
    if (!table) return;

    // ─── Join & Ready ───
    if (!this.joined) {
      const alreadySeated = seats.some(
        (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
      );
      if (alreadySeated) {
        this.joined = true;
        log.info("Already seated at table.");
      } else if (table.state === "Waiting") {
        const buyIn = this.config.buyIn > 0n ? this.config.buyIn : table.minBuyIn;
        log.action(`Joining table ${this.config.tableId} at seat ${this.config.seatIndex} with ${buyIn} chips`);
        await this.chain.joinTable(this.config.tableId, buyIn, this.config.seatIndex);
        this.joined = true;
      }
      return;
    }

    if (!this.readied) {
      const mySeat = seats.find(
        (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
      );
      if (mySeat && !mySeat.isReady && table.state === "Waiting") {
        log.action("Setting ready");
        await this.chain.setReady(this.config.tableId);
        this.readied = true;
      } else if (mySeat?.isReady) {
        this.readied = true;
      }
      return;
    }

    if (!hand) {
      // Table is InProgress but no hand? Try starting one
      if (table.state === "InProgress" && this.startHandGuard !== table.currentHandId) {
        const sorted = [...seats]
          .filter((s) => s.isOccupied && !s.isSittingOut)
          .sort((a, b) => a.seatIndex - b.seatIndex);
        if (sorted.length >= 2 && sorted[0].player.toLowerCase() === this.config.address.toLowerCase()) {
          this.startHandGuard = table.currentHandId;
          log.action("Starting new hand");
          await this.chain.startHand(this.config.tableId);
        }
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

    this.session = new MentalPokerSession();
    this.keySubmittedHand = hand.handId;
    // Reset all guards for new hand
    this.aggKeySubmittedHand = 0;
    this.deckHashSubmittedHand = 0;
    this.deckSubmittedHand = 0;
    this.shuffledHand = 0;
    this.revealedPhases.clear();
    this.bettingActedPhase = "";
    this.showdownSubmitted.clear();
    this.computeWinnerHand = 0;
    this.distributePotHand = 0;

    log.phase(`Hand #${hand.handId} — Setup`);
    log.action("Submitting public key");
    await this.chain.submitPublicKey(
      hand.handId,
      this.session.publicKey.x.toString(),
      this.session.publicKey.y.toString(),
    );
  }

  // ─── Shuffling Phase ───
  private async handleShuffling(gs: GameState) {
    const hand = gs.hand!;

    // Step A: Submit aggregate key if needed
    if (this.aggKeySubmittedHand !== hand.handId && hand.aggPubKeyX === "0") {
      const keys: Point[] = [];
      for (const ph of gs.playerHands) {
        if (ph.player && ph.player !== "0x0" && ph.publicKeyX && ph.publicKeyX !== "0") {
          keys.push({ x: BigInt(ph.publicKeyX), y: BigInt(ph.publicKeyY) });
        }
      }
      if (keys.length >= hand.numPlayers) {
        this.aggKeySubmittedHand = hand.handId;
        const aggKey = computeAggregateKey(keys);
        this.session!.setAggregateKey(keys);
        log.action("Submitting aggregate key");
        await this.chain.submitAggregateKey(hand.handId, aggKey.x.toString(), aggKey.y.toString());
      }
      return;
    }

    // Ensure session has aggregate key set
    if (this.session && !this.session.getAggregateKey() && hand.aggPubKeyX !== "0") {
      const keys: Point[] = gs.playerHands
        .filter((ph) => ph.publicKeyX && ph.publicKeyX !== "0")
        .map((ph) => ({ x: BigInt(ph.publicKeyX), y: BigInt(ph.publicKeyY) }));
      if (keys.length > 0) this.session.setAggregateKey(keys);
    }

    // Step B: Submit deck hash
    if (this.deckHashSubmittedHand !== hand.handId && hand.aggPubKeyX !== "0" && hand.deckSeed && hand.deckSeed !== "0") {
      this.deckHashSubmittedHand = hand.handId;
      const seed = BigInt(hand.deckSeed);
      const deck = this.session!.generateInitialDeck(seed);
      const serialized = serializeDeck(deck);
      const deckHash = hash.computePoseidonHashOnElements(serialized);
      log.action("Submitting deck hash");
      await this.chain.submitInitialDeckHash(hand.handId, deckHash);
      return;
    }

    // Step C: Submit initial deck
    if (this.deckSubmittedHand !== hand.handId && hand.initialDeckHash && hand.initialDeckHash !== "0" && hand.deckSeed && hand.deckSeed !== "0") {
      this.deckSubmittedHand = hand.handId;
      const seed = BigInt(hand.deckSeed);
      const deck = this.session!.generateInitialDeck(seed);
      const serialized = serializeDeck(deck);
      log.action("Submitting initial deck");
      await this.chain.submitInitialDeck(hand.handId, serialized);
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

    this.shuffledHand = hand.handId;
    log.phase("My turn to shuffle!");

    const inputDeck = deserializeDeck(gs.currentDeck.cards);
    const { serializedDeck, proofInputs } = this.session!.shuffleDeck(inputDeck);

    log.action("Generating shuffle proof...");
    const proof = await generateProof("shuffle", proofInputs);

    log.action("Submitting shuffled deck + proof");
    await this.chain.submitShuffle(hand.handId, serializedDeck, proof);
  }

  // ─── Dealing Phase ───
  private async handleDealing(gs: GameState) {
    const hand = gs.hand!;
    const phaseKey = `${hand.handId}-${hand.phase}`;
    if (this.revealedPhases.has(phaseKey)) return;
    if (!gs.currentDeck?.cards?.length || !this.session) return;

    const mySeat = gs.seats.find(
      (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
    );
    if (!mySeat) return;

    this.revealedPhases.add(phaseKey);
    this.session.loadDeck(gs.currentDeck.cards);
    log.phase(`Dealing — ${hand.phase}`);

    // Determine card positions to reveal
    const positions = this.getPositionsForPhase(hand.phase, mySeat.seatIndex, gs);

    for (const pos of positions) {
      const { token, proofInputs } = this.session.computeRevealTokenForCard(pos);

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

    this.bettingActedPhase = phaseKey;
    log.phase(`Betting — ${hand.phase} (my turn)`);

    const decision = decideBettingAction(this.config.strategy, hand, myPH, mySeat);
    log.action(`Decision: ${decision.label}`);
    await this.chain.playerAction(hand.handId, decision.action, decision.amount);
  }

  // ─── Showdown Phase ───
  private async handleShowdown(gs: GameState) {
    const hand = gs.hand!;
    if (!this.session || !gs.currentDeck?.cards?.length) return;

    const mySeat = gs.seats.find(
      (s) => s.player.toLowerCase() === this.config.address.toLowerCase(),
    );
    if (!mySeat) return;

    this.session.loadDeck(gs.currentDeck.cards);

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

      const cardId = this.session.decryptCard(pos, tokens, includeOwnToken);
      if (cardId < 0) continue;

      this.showdownSubmitted.add(key);
      log.action(`Decrypting card at position ${pos} → card #${cardId}`);
      await this.chain.submitCardDecryption(hand.handId, pos, cardId);
    }

    // Compute winner if we're the leader
    if (this.computeWinnerHand !== hand.handId) {
      const CARD_NOT_DEALT = 255;
      if (
        gs.communityCards &&
        gs.communityCards.flop1 !== CARD_NOT_DEALT &&
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
          const leader = activePlayers.sort((a, b) => a.seatIndex - b.seatIndex)[0];
          if (leader.seatIndex === mySeat.seatIndex) {
            this.computeWinnerHand = hand.handId;
            log.action("Computing winner");
            await this.chain.computeWinner(hand.handId);
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

    this.distributePotHand = hand.handId;
    log.action("Distributing pot");
    await this.chain.distributePot(hand.handId);
  }
}

// ───────────────────── Helpers ─────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ───────────────────── Entry Point ─────────────────────

const config = parseArgs();
const bot = new PokerBot(config);
bot.run().catch((err) => {
  log.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
