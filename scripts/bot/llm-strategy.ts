/**
 * LLM-powered poker strategy using Claude API.
 *
 * Constructs a structured poker prompt with game state,
 * calls Anthropic API, parses the JSON response.
 * Falls back to aggressive strategy on failure.
 */

import { log } from "./log.js";
import type { HandData, PlayerHandData, SeatData, GameState } from "./state.js";

export type Personality = "gto" | "bluffer" | "conservative";

export interface LLMDecision {
  action: number;
  amount: bigint;
  label: string;
  reasoning?: string;
}

// PlayerAction enum values matching Cairo
const Action = {
  Fold: 0,
  Check: 1,
  Call: 2,
  Bet: 3,
  Raise: 4,
  AllIn: 5,
} as const;

// Card decoding (matches Cairo's card_mapping)
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["Clubs", "Diamonds", "Hearts", "Spades"];

function cardName(id: number): string {
  if (id < 0 || id >= 52) return `Unknown(${id})`;
  return `${RANKS[Math.floor(id / 4)]} of ${SUITS[id % 4]}`;
}

function phaseName(phase: string): string {
  switch (phase) {
    case "BettingPreflop": return "Pre-Flop";
    case "BettingFlop": return "Flop";
    case "BettingTurn": return "Turn";
    case "BettingRiver": return "River";
    default: return phase;
  }
}

const PERSONALITY_PROMPTS: Record<Personality, string> = {
  gto: `You are a GTO (Game Theory Optimal) poker player. You play a balanced strategy that is difficult to exploit. You mix your actions appropriately — value betting strong hands, bluffing at the right frequencies, and making mathematically sound decisions based on pot odds and equity.`,

  bluffer: `You are an aggressive, deceptive poker player. You love to bluff, semi-bluff, and apply maximum pressure. You bet and raise frequently to put opponents in tough spots. You're not afraid to fire multiple barrels with weak hands. You believe aggression wins pots.`,

  conservative: `You are a tight, conservative poker player. You only play strong hands and rarely bluff. You prefer to check and call rather than bet and raise unless you have a very strong hand. You wait for premium holdings and extract value when you have them. Patience is your strength.`,
};

// Store last reasoning for the reasoning endpoint
let lastReasoning: { reasoning: string; action: string; timestamp: number } | null = null;

export function getLastReasoning() {
  return lastReasoning;
}

// Post reasoning to aggregator (matchmaker's multi-agent server)
async function postToAggregator(decision: LLMDecision) {
  const url = process.env.REASONING_AGGREGATOR_URL;
  if (!url) return;
  try {
    await fetch(`${url}/reasoning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: Number(process.env.AGENT_ID ?? 0),
        agentName: process.env.AGENT_NAME ?? "Unknown",
        personality: process.env.AGENT_PERSONALITY ?? "gto",
        reasoning: decision.reasoning ?? "",
        action: decision.label,
      }),
    });
  } catch {
    // Silently ignore — aggregator may not be running
  }
}

function buildPrompt(
  hand: HandData,
  myPlayerHand: PlayerHandData,
  mySeat: SeatData,
  gs: GameState,
): string {
  const holeCard1 = cardName(myPlayerHand.holeCard1Id);
  const holeCard2 = cardName(myPlayerHand.holeCard2Id);

  const communityCards: string[] = [];
  if (gs.communityCards) {
    const cc = gs.communityCards;
    if (cc.flop1 >= 0 && cc.flop1 < 52) communityCards.push(cardName(cc.flop1));
    if (cc.flop2 >= 0 && cc.flop2 < 52) communityCards.push(cardName(cc.flop2));
    if (cc.flop3 >= 0 && cc.flop3 < 52) communityCards.push(cardName(cc.flop3));
    if (cc.turn >= 0 && cc.turn < 52) communityCards.push(cardName(cc.turn));
    if (cc.river >= 0 && cc.river < 52) communityCards.push(cardName(cc.river));
  }

  const opponents = gs.playerHands
    .filter(
      (ph) =>
        ph.player.toLowerCase() !== mySeat.player.toLowerCase() &&
        !ph.hasFolded &&
        ph.player !== "0x0",
    )
    .map((ph) => {
      const seat = gs.seats.find((s) => s.seatIndex === ph.seatIndex);
      return {
        seat: ph.seatIndex,
        chips: seat?.chips ?? 0n,
        betThisRound: ph.betThisRound,
        totalBet: ph.totalBet,
        isAllIn: ph.isAllIn,
      };
    });

  const toCall = hand.currentBet - myPlayerHand.betThisRound;
  const potOdds = toCall > 0n && hand.pot > 0n
    ? `${((Number(toCall) / Number(hand.pot + toCall)) * 100).toFixed(1)}%`
    : "N/A (no bet to call)";

  return `You are playing Texas Hold'em poker. Here is the current game state:

**Your Hand:** ${holeCard1}, ${holeCard2}
**Community Cards:** ${communityCards.length > 0 ? communityCards.join(", ") : "None (Pre-Flop)"}
**Phase:** ${phaseName(hand.phase)}

**Pot:** ${hand.pot}
**Current Bet:** ${hand.currentBet}
**Your Bet This Round:** ${myPlayerHand.betThisRound}
**Amount to Call:** ${toCall}
**Pot Odds:** ${potOdds}

**Your Chips:** ${mySeat.chips}
**Your Position:** Seat ${mySeat.seatIndex} (Dealer is Seat ${hand.dealerSeat})

**Opponents Still In Hand:**
${opponents.length > 0
  ? opponents
      .map(
        (o) =>
          `  - Seat ${o.seat}: ${o.chips} chips, bet ${o.betThisRound} this round${o.isAllIn ? " (ALL-IN)" : ""}`,
      )
      .join("\n")
  : "  None"}

**Active Players:** ${hand.activePlayers}

Respond with a JSON object (no markdown, no explanation outside JSON):
{
  "action": "fold" | "check" | "call" | "bet" | "raise" | "allin",
  "amount": <number, only for bet/raise — the TOTAL bet amount, not the additional amount>,
  "reasoning": "<brief 1-2 sentence explanation of your decision>"
}

Rules:
- You can only "check" if there's no bet to call (amount to call = 0)
- "call" matches the current bet
- "bet" is only valid when no one has bet yet (current bet = 0); amount must be >= big blind
- "raise" must be at least 2x the current bet
- "allin" commits all your remaining chips
- amount for bet/raise is the TOTAL bet size, not the raise increment`;
}

function parseAction(response: string): { action: string; amount: number; reasoning: string } | null {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Handle markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;

  try {
    const parsed = JSON.parse(objMatch[0]);
    return {
      action: String(parsed.action || "fold").toLowerCase(),
      amount: Number(parsed.amount || 0),
      reasoning: String(parsed.reasoning || ""),
    };
  } catch {
    return null;
  }
}

function actionStringToDecision(
  parsed: { action: string; amount: number; reasoning: string },
  toCall: bigint,
  myChips: bigint,
  currentBet: bigint,
): LLMDecision {
  const reasoning = parsed.reasoning;

  switch (parsed.action) {
    case "fold":
      return { action: Action.Fold, amount: 0n, label: "fold (LLM)", reasoning };

    case "check":
      return { action: Action.Check, amount: 0n, label: "check (LLM)", reasoning };

    case "call": {
      const callAmount = toCall > myChips ? myChips : toCall;
      if (callAmount <= 0n) {
        return { action: Action.Check, amount: 0n, label: "check (LLM, no bet to call)", reasoning };
      }
      return { action: Action.Call, amount: callAmount, label: `call ${callAmount} (LLM)`, reasoning };
    }

    case "bet": {
      const betAmount = BigInt(parsed.amount);
      const capped = betAmount > myChips ? myChips : betAmount;
      if (capped <= 0n) {
        return { action: Action.Check, amount: 0n, label: "check (LLM, can't bet 0)", reasoning };
      }
      return { action: Action.Bet, amount: capped, label: `bet ${capped} (LLM)`, reasoning };
    }

    case "raise": {
      const raiseAmount = BigInt(parsed.amount);
      const cappedRaise = raiseAmount > myChips ? myChips : raiseAmount;
      if (cappedRaise <= currentBet) {
        // Not a valid raise, just call
        const callAmt = toCall > myChips ? myChips : toCall;
        return { action: Action.Call, amount: callAmt, label: `call ${callAmt} (LLM, raise too small)`, reasoning };
      }
      return { action: Action.Raise, amount: cappedRaise, label: `raise to ${cappedRaise} (LLM)`, reasoning };
    }

    case "allin":
    case "all-in":
    case "all_in":
      return { action: Action.AllIn, amount: myChips, label: `all-in ${myChips} (LLM)`, reasoning };

    default:
      return { action: Action.Fold, amount: 0n, label: `fold (LLM, unknown action: ${parsed.action})`, reasoning };
  }
}

export async function decideLLMAction(
  hand: HandData,
  myPlayerHand: PlayerHandData,
  mySeat: SeatData,
  gs: GameState,
  personality: Personality = "gto",
): Promise<LLMDecision> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log.warn("No ANTHROPIC_API_KEY set — falling back to aggressive strategy");
    return fallback(hand, myPlayerHand, mySeat);
  }

  const prompt = buildPrompt(hand, myPlayerHand, mySeat, gs);
  const systemPrompt = PERSONALITY_PROMPTS[personality];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      log.warn(`Anthropic API error ${response.status}: ${errText}`);
      return fallback(hand, myPlayerHand, mySeat);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    const parsed = parseAction(text);
    if (!parsed) {
      log.warn(`Failed to parse LLM response: ${text.slice(0, 200)}`);
      return fallback(hand, myPlayerHand, mySeat);
    }

    const toCall = hand.currentBet - myPlayerHand.betThisRound;
    const decision = actionStringToDecision(parsed, toCall, mySeat.chips, hand.currentBet);

    // Store reasoning for the reasoning endpoint
    lastReasoning = {
      reasoning: decision.reasoning || "",
      action: decision.label,
      timestamp: Date.now(),
    };

    // Post to matchmaker's multi-agent aggregator
    postToAggregator(decision);

    log.info(`LLM reasoning: ${decision.reasoning}`);
    return decision;
  } catch (err: any) {
    log.warn(`LLM call failed: ${err.message}`);
    return fallback(hand, myPlayerHand, mySeat);
  }
}

// Fallback to aggressive strategy when LLM is unavailable
function fallback(
  hand: HandData,
  myPlayerHand: PlayerHandData,
  mySeat: SeatData,
): LLMDecision {
  // Inline a simplified aggressive strategy to avoid circular imports
  const toCall = hand.currentBet - myPlayerHand.betThisRound;
  const myChips = mySeat.chips;
  const pot = hand.pot;

  if (toCall <= 0n) {
    if (Math.random() < 0.7 && pot > 0n) {
      const betSize = pot / 2n + BigInt(Math.floor(Math.random() * Number(pot / 4n)));
      const bet = betSize > myChips ? myChips : betSize;
      if (bet > 0n) {
        return { action: Action.Bet, amount: bet, label: `bet ${bet} (fallback)` };
      }
    }
    return { action: Action.Check, amount: 0n, label: "check (fallback)" };
  }

  if (toCall <= myChips) {
    return { action: Action.Call, amount: toCall, label: `call ${toCall} (fallback)` };
  }

  if (myChips > 0n) {
    return { action: Action.AllIn, amount: myChips, label: `all-in ${myChips} (fallback)` };
  }

  return { action: Action.Fold, amount: 0n, label: "fold (fallback)" };
}

// ─── Agent Table Talk ───

const TABLE_TALK_PROMPTS: Record<Personality, string> = {
  gto: `You are a poker AI at the table. Generate a short, witty table talk message (max 60 chars). Be analytical and confident. No emojis.`,
  bluffer: `You are an aggressive poker AI. Generate a short, cocky trash talk message (max 60 chars). Taunt your opponents. No emojis.`,
  conservative: `You are a patient poker AI. Generate a short, calm table talk message (max 60 chars). Be stoic and composed. No emojis.`,
};

export async function generateTableTalk(
  personality: Personality,
  context: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 64,
        system: TABLE_TALK_PROMPTS[personality],
        messages: [{ role: "user", content: `Game context: ${context}\n\nGenerate one short message:` }],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() ?? "";
    // Strip quotes if present
    return text.replace(/^["']|["']$/g, "").slice(0, 60) || null;
  } catch {
    return null;
  }
}

// ─── Reasoning HTTP server ───

import { createServer } from "http";

let reasoningServer: ReturnType<typeof createServer> | null = null;

export function startReasoningServer(port: number) {
  reasoningServer = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/reasoning") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(lastReasoning ?? { reasoning: "No decision yet", action: "", timestamp: 0 }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  reasoningServer.listen(port, () => {
    log.info(`Reasoning server listening on port ${port}`);
  });
}
