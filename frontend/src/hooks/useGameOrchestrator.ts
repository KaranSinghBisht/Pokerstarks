"use client";

import { useGame } from "./useGame";
import { usePokerActions } from "./usePokerActions";
import { useKeySetup } from "./useKeySetup";
import { useShuffle } from "./useShuffle";
import { useReveal } from "./useReveal";
import { useStarknet } from "@/providers/StarknetProvider";
import { GamePhase } from "@/lib/constants";

export function useGameOrchestrator(tableId: number) {
  const { address, account } = useStarknet();

  // Core game state from Torii
  const {
    table,
    seats,
    hand,
    playerHands,
    communityCards,
    currentDeck,
    revealTokens,
    loading,
    error: gameError,
    refresh,
  } = useGame(tableId);

  // Transaction actions
  const actions = usePokerActions(tableId, account);

  // Key setup (auto-submits public key on Setup phase)
  const {
    session,
    keySubmitted,
    isSubmitting: isSubmittingKey,
    error: keyError,
  } = useKeySetup({
    hand,
    playerHands,
    seats,
    myAddress: address,
    submitPublicKey: actions.submitPublicKey,
    submitAggregateKey: actions.submitAggregateKey,
    submitInitialDeckHash: actions.submitInitialDeckHash,
    submitInitialDeck: actions.submitInitialDeck,
  });

  // Shuffle (auto-shuffles when it's our turn)
  const {
    isMyTurnToShuffle,
    isShuffling,
    shuffleProgress,
    error: shuffleError,
  } = useShuffle({
    hand,
    seats,
    myAddress: address,
    session,
    submitShuffle: actions.submitShuffle,
    currentDeckData: currentDeck?.cards ?? null,
  });

  // Reveal tokens (auto-submits during dealing phases)
  const {
    myHoleCards,
    isRevealing,
    revealProgress,
    error: revealError,
  } = useReveal({
    hand,
    playerHands,
    communityCards,
    seats,
    myAddress: address,
    session,
    submitRevealToken: actions.submitRevealToken,
    currentDeckData: currentDeck?.cards ?? null,
    revealTokens,
  });

  // Computed state
  const phase = hand?.phase;
  const mySeat = seats.find(
    (s) => s.player.toLowerCase() === address?.toLowerCase()
  );
  const isMyTurn =
    !!hand &&
    !!mySeat &&
    hand.currentTurnSeat === mySeat.seatIndex &&
    (phase === GamePhase.BettingPreflop ||
      phase === GamePhase.BettingFlop ||
      phase === GamePhase.BettingTurn ||
      phase === GamePhase.BettingRiver);

  const isProving = isShuffling || isRevealing || isSubmittingKey;
  const provingProgress = isShuffling
    ? shuffleProgress
    : isRevealing
      ? revealProgress
      : 0;

  const error = gameError || keyError || shuffleError || revealError;

  return {
    table,
    seats,
    hand,
    playerHands,
    communityCards,
    loading,
    error,
    myHoleCards,
    isProving,
    provingProgress,
    phase,
    isMyTurn,
    isMyTurnToShuffle,
    actions,
    refresh,
  };
}
