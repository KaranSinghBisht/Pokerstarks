/**
 * Poker betting strategy for bots.
 * Port of scripts/bot/strategy.ts.
 */

import type { HandData, PlayerHandData, SeatData } from "./state";

export type StrategyMode = "passive" | "aggressive" | "random";

const Action = {
  Fold: 0,
  Check: 1,
  Call: 2,
  Bet: 3,
  Raise: 4,
  AllIn: 5,
} as const;

export interface BettingDecision {
  action: number;
  amount: bigint;
  label: string;
}

export function decideBettingAction(
  mode: StrategyMode,
  hand: HandData,
  myPlayerHand: PlayerHandData,
  mySeat: SeatData,
): BettingDecision {
  const myChips = mySeat.chips;
  const currentBet = hand.currentBet;
  const myBet = myPlayerHand.betThisRound;
  const toCall = currentBet - myBet;
  const pot = hand.pot;

  if (myPlayerHand.isAllIn) {
    return { action: Action.Check, amount: 0n, label: "check (all-in)" };
  }

  switch (mode) {
    case "passive":
      return passiveStrategy(toCall, myChips, pot);
    case "aggressive":
      return aggressiveStrategy(toCall, myChips, pot, currentBet, hand);
    case "random":
      return randomStrategy(toCall, myChips, pot, currentBet);
  }
}

function passiveStrategy(
  toCall: bigint,
  myChips: bigint,
  pot: bigint,
): BettingDecision {
  if (toCall <= 0n) {
    return { action: Action.Check, amount: 0n, label: "check" };
  }
  if (toCall <= pot / 3n && toCall <= myChips) {
    return { action: Action.Call, amount: toCall, label: `call ${toCall}` };
  }
  if (toCall <= pot && toCall <= myChips) {
    if (Math.random() < 0.6) {
      return { action: Action.Call, amount: toCall, label: `call ${toCall}` };
    }
    return { action: Action.Fold, amount: 0n, label: "fold (passive)" };
  }
  if (Math.random() < 0.2 && toCall <= myChips) {
    return {
      action: Action.Call,
      amount: toCall,
      label: `call ${toCall} (reluctant)`,
    };
  }
  return { action: Action.Fold, amount: 0n, label: "fold" };
}

function aggressiveStrategy(
  toCall: bigint,
  myChips: bigint,
  pot: bigint,
  currentBet: bigint,
  hand: HandData,
): BettingDecision {
  const isPreflop = hand.phase === "BettingPreflop";

  if (toCall <= 0n) {
    if (Math.random() < 0.7 && pot > 0n) {
      const betSize =
        pot / 2n + BigInt(Math.floor(Math.random() * Number(pot / 4n)));
      const bet = betSize > myChips ? myChips : betSize;
      if (bet > 0n) {
        return { action: Action.Bet, amount: bet, label: `bet ${bet}` };
      }
    }
    return { action: Action.Check, amount: 0n, label: "check" };
  }

  if (isPreflop && Math.random() < 0.4) {
    const raiseSize = currentBet * 3n;
    if (raiseSize <= myChips) {
      return {
        action: Action.Raise,
        amount: raiseSize,
        label: `raise to ${raiseSize}`,
      };
    }
  }

  if (!isPreflop && Math.random() < 0.25 && currentBet > 0n) {
    const raiseSize = currentBet * 2n + pot / 4n;
    if (raiseSize <= myChips) {
      return {
        action: Action.Raise,
        amount: raiseSize,
        label: `raise to ${raiseSize}`,
      };
    }
  }

  if (toCall <= myChips) {
    return { action: Action.Call, amount: toCall, label: `call ${toCall}` };
  }

  if (toCall > myChips && myChips > 0n) {
    return {
      action: Action.AllIn,
      amount: myChips,
      label: `all-in ${myChips}`,
    };
  }

  return { action: Action.Fold, amount: 0n, label: "fold" };
}

function randomStrategy(
  toCall: bigint,
  myChips: bigint,
  pot: bigint,
  currentBet: bigint,
): BettingDecision {
  const roll = Math.random();

  if (toCall <= 0n) {
    if (roll < 0.5 && pot > 0n) {
      const bet = BigInt(Math.floor(Math.random() * Number(pot))) + 1n;
      const capped = bet > myChips ? myChips : bet;
      if (capped > 0n) {
        return {
          action: Action.Bet,
          amount: capped,
          label: `bet ${capped} (chaos)`,
        };
      }
    }
    return { action: Action.Check, amount: 0n, label: "check" };
  }

  if (roll < 0.2) {
    return { action: Action.Fold, amount: 0n, label: "fold (chaos)" };
  }
  if (roll < 0.6 && toCall <= myChips) {
    return {
      action: Action.Call,
      amount: toCall,
      label: `call ${toCall} (chaos)`,
    };
  }
  if (roll < 0.9 && currentBet * 2n <= myChips) {
    const raiseSize =
      currentBet * 2n +
      BigInt(Math.floor(Math.random() * Number(pot / 2n)));
    return {
      action: Action.Raise,
      amount: raiseSize,
      label: `raise to ${raiseSize} (chaos)`,
    };
  }
  if (myChips > 0n) {
    return {
      action: Action.AllIn,
      amount: myChips,
      label: `all-in ${myChips} (YOLO)`,
    };
  }

  return { action: Action.Fold, amount: 0n, label: "fold" };
}
