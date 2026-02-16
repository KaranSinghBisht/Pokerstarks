"use client";

import { useEffect, useRef } from "react";
import { useGame } from "./useGame";
import { usePokerActions } from "./usePokerActions";
import { useKeySetup } from "./useKeySetup";
import { useShuffle } from "./useShuffle";
import { useReveal } from "./useReveal";
import { useStarknet } from "@/providers/StarknetProvider";
import { GamePhase } from "@/lib/constants";

const CARD_NOT_DEALT = 255;

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
    submitCardDecryption: actions.submitCardDecryption,
    currentDeckData: currentDeck?.cards ?? null,
    revealTokens,
  });

  // ─── Auto-trigger: start_hand ───────────────────────────────────
  // When table is InProgress and there's no active hand (or the last
  // hand finished settling), the first seated player auto-calls start_hand.
  const startHandCalledRef = useRef<number>(0);

  useEffect(() => {
    if (!table || !address || !account) return;
    if (table.state !== "InProgress") return;

    // Only trigger when previous hand is fully settled:
    //   phase=Setup AND keysSubmitted=numPlayers (finalized sentinel).
    // A freshly started hand has keysSubmitted=0, preventing re-trigger.
    if (hand) {
      if (hand.phase !== GamePhase.Setup) return;
      if (hand.keysSubmitted !== hand.numPlayers) return;
    }

    const sortedSeats = [...seats]
      .filter((s) => s.isOccupied && !s.isSittingOut)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    if (sortedSeats.length < 2) return;
    if (sortedSeats[0].player.toLowerCase() !== address.toLowerCase()) return;

    const guard = table.currentHandId;
    if (startHandCalledRef.current === guard && guard > 0) return;
    startHandCalledRef.current = guard;

    actions.startHand().catch((err: unknown) => {
      console.error("Auto start_hand failed:", err);
      startHandCalledRef.current = 0;
    });
  }, [table, hand, seats, address, account, actions]);

  // ─── Auto-trigger: computeWinner ──────────────────────────────
  // When phase is Showdown and all required cards have been revealed
  // (community cards + non-folded players' hole cards), call computeWinner.
  const computeWinnerCalledRef = useRef<number>(0);

  useEffect(() => {
    if (!hand || !account || !address) return;
    if (hand.phase !== GamePhase.Showdown) return;
    if (computeWinnerCalledRef.current === hand.handId) return;

    if (!communityCards) return;
    if (
      communityCards.flop1 === CARD_NOT_DEALT ||
      communityCards.flop2 === CARD_NOT_DEALT ||
      communityCards.flop3 === CARD_NOT_DEALT ||
      communityCards.turn === CARD_NOT_DEALT ||
      communityCards.river === CARD_NOT_DEALT
    ) return;

    const activePlayers = playerHands.filter(
      (ph) => ph.player && ph.player !== "0x0" && !ph.hasFolded,
    );
    const allRevealed = activePlayers.every(
      (ph) => ph.holeCard1Id !== CARD_NOT_DEALT && ph.holeCard2Id !== CARD_NOT_DEALT,
    );
    if (!allRevealed) return;

    // Leader election: lowest non-folded seat calls
    const leader = activePlayers.sort((a, b) => a.seatIndex - b.seatIndex)[0];
    const mySeatIdx = seats.find(
      (s) => s.player.toLowerCase() === address.toLowerCase(),
    )?.seatIndex;
    if (leader.seatIndex !== mySeatIdx) return;

    computeWinnerCalledRef.current = hand.handId;
    actions.computeWinner(hand.handId).catch((err: unknown) => {
      console.error("Auto computeWinner failed:", err);
      computeWinnerCalledRef.current = 0;
    });
  }, [hand, communityCards, playerHands, seats, address, account, actions]);

  // ─── Auto-trigger: distributePot ──────────────────────────────
  // When phase is Settling, auto-call distributePot to finalize the hand.
  const distributePotCalledRef = useRef<number>(0);

  useEffect(() => {
    if (!hand || !account || !address) return;
    if (hand.phase !== GamePhase.Settling) return;
    if (distributePotCalledRef.current === hand.handId) return;

    // Leader election: lowest occupied seat
    const sortedSeats = [...seats]
      .filter((s) => s.isOccupied)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    if (sortedSeats.length === 0) return;
    if (sortedSeats[0].player.toLowerCase() !== address.toLowerCase()) return;

    distributePotCalledRef.current = hand.handId;
    actions.distributePot(hand.handId).catch((err: unknown) => {
      console.error("Auto distributePot failed:", err);
      distributePotCalledRef.current = 0;
    });
  }, [hand, seats, address, account, actions]);

  // ─── Computed state ───────────────────────────────────────────
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
