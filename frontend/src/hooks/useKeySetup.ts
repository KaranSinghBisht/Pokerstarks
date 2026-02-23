"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MentalPokerSession } from "@/lib/cards/mental-poker";
import { computeAggregateKey, type Point } from "@/lib/cards/elgamal";
import { serializeDeck } from "@/lib/noir/shuffle";
import { hash } from "starknet";
import { GamePhase } from "@/lib/constants";
import type { HandData, PlayerHandData, SeatData } from "@/lib/types";

const SESSION_STORAGE_PREFIX = "pokerstarks.session.v1";
const SESSION_SECRET_PERSISTENCE_ENABLED =
  process.env.NEXT_PUBLIC_PERSIST_SESSION_SECRET === "true";
const SESSION_SECRET_TTL_MS = 1000 * 60 * 60 * 2;

interface PersistedSessionSecret {
  secretKey: string;
  createdAt: number;
}

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

function getSessionStorageKey(handId: number, address: string): string {
  return `${SESSION_STORAGE_PREFIX}:${address.toLowerCase()}:${handId}`;
}

function persistSessionSecret(
  handId: number,
  address: string,
  secretKey: bigint,
) {
  if (!SESSION_SECRET_PERSISTENCE_ENABLED) return;
  if (typeof window === "undefined") return;

  const payload: PersistedSessionSecret = {
    secretKey: secretKey.toString(),
    createdAt: Date.now(),
  };

  sessionStorage.setItem(
    getSessionStorageKey(handId, address),
    JSON.stringify(payload),
  );
}

function removeSessionSecret(handId: number, address: string) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(getSessionStorageKey(handId, address));
}

function purgeExpiredSessionSecrets(address: string) {
  if (!SESSION_SECRET_PERSISTENCE_ENABLED) return;
  if (typeof window === "undefined") return;

  const keyPrefix = `${SESSION_STORAGE_PREFIX}:${address.toLowerCase()}:`;
  const now = Date.now();

  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const key = sessionStorage.key(i);
    if (!key || !key.startsWith(keyPrefix)) continue;

    const value = sessionStorage.getItem(key);
    if (!value) {
      sessionStorage.removeItem(key);
      continue;
    }

    try {
      const parsed = JSON.parse(value) as Partial<PersistedSessionSecret>;
      if (typeof parsed.createdAt !== "number") {
        sessionStorage.removeItem(key);
        continue;
      }

      if (now - parsed.createdAt > SESSION_SECRET_TTL_MS) {
        sessionStorage.removeItem(key);
      }
    } catch {
      sessionStorage.removeItem(key);
    }
  }
}

function restoreSession(handId: number, address: string): MentalPokerSession | null {
  if (!SESSION_SECRET_PERSISTENCE_ENABLED) return null;
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(getSessionStorageKey(handId, address));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSessionSecret>;
    if (
      typeof parsed.secretKey !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      removeSessionSecret(handId, address);
      return null;
    }

    if (Date.now() - parsed.createdAt > SESSION_SECRET_TTL_MS) {
      removeSessionSecret(handId, address);
      return null;
    }

    return MentalPokerSession.fromSecretKey(BigInt(parsed.secretKey));
  } catch {
    removeSessionSecret(handId, address);
    return null;
  }
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
  const [sessionState, setSessionState] = useState<MentalPokerSession | null>(null);
  const [keySubmitted, setKeySubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedHandRef = useRef<number>(0);
  const aggKeySubmittedRef = useRef<number>(0);
  const deckSubmittedRef = useRef<number>(0);
  const hydratedSessionRef = useRef<string>("");

  // Find my seat
  const mySeat = seats.find(
    (s) => s.player.toLowerCase() === myAddress?.toLowerCase()
  );

  const setSession = useCallback((session: MentalPokerSession | null) => {
    sessionRef.current = session;
    setSessionState(session);
  }, []);

  // Rehydrate in-memory session from sessionStorage on hand change.
  useEffect(() => {
    if (!hand || !myAddress) return;

    purgeExpiredSessionSecrets(myAddress);

    const hydrateKey = `${myAddress.toLowerCase()}:${hand.handId}`;
    if (hydratedSessionRef.current === hydrateKey) return;
    hydratedSessionRef.current = hydrateKey;

    const restored = restoreSession(hand.handId, myAddress);
    if (restored) {
      setSession(restored);
      setKeySubmitted(true);
      setError(null);
      return;
    }

    setSession(null);
    setKeySubmitted(false);
    setError(null);
  }, [hand, myAddress, setSession]);

  // Auto-submit public key when Setup phase starts
  useEffect(() => {
    if (!hand || !mySeat || !myAddress) return;
    if (hand.phase !== GamePhase.Setup) return;
    if (submittedHandRef.current === hand.handId) return;

    const myPh = playerHands.find(
      (ph) => ph.player.toLowerCase() === myAddress.toLowerCase()
    );
    // If key already exists on-chain, avoid resubmission.
    if (myPh && myPh.publicKeyX && myPh.publicKeyX !== "0") {
      submittedHandRef.current = hand.handId;
      setKeySubmitted(true);
      return;
    }

    const doSetup = async () => {
      setIsSubmitting(true);
      setError(null);
      try {
        // Reuse restored session if available; otherwise generate + persist.
        let session = sessionRef.current;
        if (!session) {
          session = new MentalPokerSession();
          setSession(session);
          persistSessionSecret(hand.handId, myAddress, session.secretKey);
        }

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
  }, [hand, mySeat, myAddress, playerHands, submitPublicKey, setSession]);

  // Step 2: Submit aggregate key once all public keys are indexed
  useEffect(() => {
    if (!hand || !sessionRef.current || !myAddress) return;
    if (hand.phase !== GamePhase.Shuffling) return;
    if (aggKeySubmittedRef.current === hand.handId) return;

    // S-04 FIX: If aggregate key already set on-chain, skip resubmission.
    if (hand.aggPubKeyX && hand.aggPubKeyX !== "0") {
      aggKeySubmittedRef.current = hand.handId;
      // Still set the aggregate key on the local session so shuffle works
      const keys: Point[] = [];
      for (const ph of playerHands) {
        if (ph.player === "" || ph.player === "0x0") continue;
        if (ph.publicKeyX && ph.publicKeyX !== "0") {
          keys.push({ x: BigInt(ph.publicKeyX), y: BigInt(ph.publicKeyY) });
        }
      }
      if (keys.length >= hand.numPlayers) {
        sessionRef.current.setAggregateKey(keys);
      }
      return;
    }

    const keys: Point[] = [];
    for (const ph of playerHands) {
      if (ph.player === "" || ph.player === "0x0") continue;
      if (ph.publicKeyX && ph.publicKeyX !== "0") {
        keys.push({
          x: BigInt(ph.publicKeyX),
          y: BigInt(ph.publicKeyY),
        });
      }
    }

    if (keys.length < hand.numPlayers) return;

    aggKeySubmittedRef.current = hand.handId;
    const aggKey = computeAggregateKey(keys);
    sessionRef.current.setAggregateKey(keys);

    submitAggregateKey(
      hand.handId,
      aggKey.x.toString(),
      aggKey.y.toString(),
    ).catch((err: unknown) => {
      console.error("Aggregate key submission failed:", err);
      aggKeySubmittedRef.current = 0;
    });
  }, [hand, playerHands, myAddress, submitAggregateKey]);

  // Step 3: Submit deck hash once aggregate key consensus is reached
  const deckHashSubmittedRef = useRef<number>(0);
  useEffect(() => {
    if (!hand || !sessionRef.current || !myAddress) return;
    if (hand.phase !== GamePhase.Shuffling) return;
    if (hand.aggPubKeyX === "0") return;
    if (deckHashSubmittedRef.current === hand.handId) return;
    if (!hand.deckSeed || hand.deckSeed === "0") return;

    // S-04 FIX: If deck hash already set on-chain, skip resubmission.
    if (hand.initialDeckHash && hand.initialDeckHash !== "0") {
      deckHashSubmittedRef.current = hand.handId;
      return;
    }

    deckHashSubmittedRef.current = hand.handId;

    const seed = BigInt(hand.deckSeed);
    const deck = sessionRef.current.generateInitialDeck(seed);
    const serialized = serializeDeck(deck);
    const deckHash = hash.computePoseidonHashOnElements(serialized);

    submitInitialDeckHash(hand.handId, deckHash).catch((err: unknown) => {
      console.error("Deck hash submission failed:", err);
      deckHashSubmittedRef.current = 0;
    });
  }, [hand, myAddress, submitInitialDeckHash]);

  // Step 4: Submit full deck once hash consensus is reached
  useEffect(() => {
    if (!hand || !sessionRef.current || !myAddress) return;
    if (hand.phase !== GamePhase.Shuffling) return;
    if (hand.initialDeckHash === "0") return;
    if (deckSubmittedRef.current === hand.handId) return;
    if (!hand.deckSeed || hand.deckSeed === "0") return;

    // S-04 FIX: If shuffle has already started, the initial deck was
    // already submitted — skip to avoid wasting gas on a revert.
    if (hand.shuffleProgress > 0) {
      deckSubmittedRef.current = hand.handId;
      return;
    }

    deckSubmittedRef.current = hand.handId;

    const seed = BigInt(hand.deckSeed);
    const deck = sessionRef.current.generateInitialDeck(seed);
    const serialized = serializeDeck(deck);

    submitInitialDeck(hand.handId, serialized).catch((err: unknown) => {
      console.error("Initial deck submission failed:", err);
      deckSubmittedRef.current = 0;
    });
  }, [hand, myAddress, submitInitialDeck]);

  return {
    session: sessionState,
    keySubmitted,
    isSubmitting,
    error,
  };
}
