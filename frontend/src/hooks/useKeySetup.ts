"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MentalPokerSession } from "@/lib/cards/mental-poker";
import { computeAggregateKey, type Point } from "@/lib/cards/elgamal";
import { serializeDeck } from "@/lib/noir/shuffle";
import { hash } from "starknet";
import { GamePhase } from "@/lib/constants";
import type { HandData, PlayerHandData, SeatData } from "@/lib/types";

interface UseKeySetupOptions {
  hand: HandData | undefined;
  playerHands: PlayerHandData[];
  seats: SeatData[];
  myAddress: string | null;
  submitPublicKey: (handId: number, pkX: string, pkY: string) => Promise<void>;
  submitAggregateKey: (handId: number, aggPkX: string, aggPkY: string) => Promise<void>;
  submitInitialDeckHash: (handId: number, deckHash: string) => Promise<void>;
  submitInitialDeck: (handId: number, deck: string[]) => Promise<void>;
}

interface UseKeySetupReturn {
  session: MentalPokerSession | null;
  keySubmitted: boolean;
  isSubmitting: boolean;
  error: string | null;
}

export function useKeySetup({
  hand,
  playerHands,
  seats,
  myAddress,
  submitPublicKey,
  submitAggregateKey,
  submitInitialDeckHash,
  submitInitialDeck,
}: UseKeySetupOptions): UseKeySetupReturn {
  const sessionRef = useRef<MentalPokerSession | null>(null);
  const [keySubmitted, setKeySubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedHandRef = useRef<number>(0);
  const aggKeySubmittedRef = useRef<number>(0);
  const deckSubmittedRef = useRef<number>(0);

  // Find my seat
  const mySeat = seats.find(
    (s) => s.player.toLowerCase() === myAddress?.toLowerCase()
  );

  // Auto-submit public key when Setup phase starts
  useEffect(() => {
    if (!hand || !mySeat || !myAddress) return;
    if (hand.phase !== GamePhase.Setup) return;
    if (submittedHandRef.current === hand.handId) return;

    const myPh = playerHands.find(
      (ph) => ph.player.toLowerCase() === myAddress.toLowerCase()
    );
    // If key already submitted on-chain, skip
    if (myPh && myPh.holeCard1Id !== undefined) {
      // Check if public key fields exist (they're stored as pk_x/pk_y)
      // We can't easily check from PlayerHandData, so just guard with ref
    }

    const doSetup = async () => {
      setIsSubmitting(true);
      setError(null);
      try {
        // Create new session for this hand (keypair auto-generated in constructor)
        const session = new MentalPokerSession();
        sessionRef.current = session;

        submittedHandRef.current = hand.handId;
        await submitPublicKey(
          hand.handId,
          session.publicKey.x.toString(),
          session.publicKey.y.toString(),
        );
        setKeySubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Key submission failed");
        submittedHandRef.current = 0; // Allow retry
      } finally {
        setIsSubmitting(false);
      }
    };

    doSetup();
  }, [hand, mySeat, myAddress, playerHands, submitPublicKey]);

  // When all keys are submitted, compute aggregate key + submit initial deck
  useEffect(() => {
    if (!hand || !sessionRef.current || !myAddress) return;
    if (hand.phase !== GamePhase.Shuffling) return;
    if (aggKeySubmittedRef.current === hand.handId) return;

    // Collect all public keys from playerHands
    const keys: Point[] = [];
    for (const ph of playerHands) {
      if (ph.player === "" || ph.player === "0x0") continue;
      if (ph.publicKeyX && ph.publicKeyY) {
        keys.push({
          x: BigInt(ph.publicKeyX),
          y: BigInt(ph.publicKeyY),
        });
      }
    }

    // If we don't have all keys yet from the indexed data, skip
    if (keys.length < hand.numPlayers) return;

    const doAggregateAndDeck = async () => {
      try {
        aggKeySubmittedRef.current = hand.handId;
        const aggKey = computeAggregateKey(keys);
        sessionRef.current!.setAggregateKey(keys);

        // Submit aggregate key on-chain (consensus: all players must submit same key)
        await submitAggregateKey(
          hand.handId,
          aggKey.x.toString(),
          aggKey.y.toString(),
        );

        // Generate initial deck using deterministic seed from contract
        if (deckSubmittedRef.current !== hand.handId && hand.deckSeed) {
          deckSubmittedRef.current = hand.handId;
          const seed = BigInt(hand.deckSeed);
          const deck = sessionRef.current!.generateInitialDeck(seed);
          const serialized = serializeDeck(deck);

          // Submit deck hash for consensus (all players verify independently)
          // Must match contract's poseidon_hash_span(deck.span())
          const deckHash = hash.computePoseidonHashOnElements(serialized);
          await submitInitialDeckHash(hand.handId, deckHash);

          // Submit the full deck (only accepted after hash consensus)
          await submitInitialDeck(hand.handId, serialized);
        }
      } catch (err) {
        console.error("Aggregate key/deck submission failed:", err);
        aggKeySubmittedRef.current = 0;
        deckSubmittedRef.current = 0;
      }
    };

    doAggregateAndDeck();
  }, [hand, playerHands, myAddress, submitAggregateKey, submitInitialDeckHash, submitInitialDeck]);

  // Reset when hand changes
  useEffect(() => {
    if (hand && hand.handId !== submittedHandRef.current) {
      setKeySubmitted(false);
      setError(null);
    }
  }, [hand]);

  return {
    session: sessionRef.current,
    keySubmitted,
    isSubmitting,
    error,
  };
}
