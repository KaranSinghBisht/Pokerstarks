"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MentalPokerSession } from "@/lib/cards/mental-poker";
import { deserializeDeck } from "@/lib/noir/shuffle";
import { GamePhase } from "@/lib/constants";
import type { HandData, SeatData } from "@/lib/types";

interface UseShuffleOptions {
  hand: HandData | undefined;
  seats: SeatData[];
  myAddress: string | null;
  session: MentalPokerSession | null;
  submitShuffle: (handId: number, newDeck: string[], proof: string[]) => Promise<void>;
  // Raw deck data from Torii (EncryptedDeck model)
  currentDeckData: string[] | null;
}

interface UseShuffleReturn {
  isMyTurnToShuffle: boolean;
  isShuffling: boolean;
  shuffleProgress: number; // 0-100
  error: string | null;
}

export function useShuffle({
  hand,
  seats,
  myAddress,
  session,
  submitShuffle,
  currentDeckData,
}: UseShuffleOptions): UseShuffleReturn {
  const [isShuffling, setIsShuffling] = useState(false);
  const [shuffleProgress, setShuffleProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const shuffledHandRef = useRef<number>(0);

  // Find my position among occupied seats
  const occupiedSeats = seats
    .filter((s) => s.isOccupied && !s.isSittingOut)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  const myOccupiedIndex = occupiedSeats.findIndex(
    (s) => s.player.toLowerCase() === myAddress?.toLowerCase()
  );

  const isMyTurnToShuffle =
    !!hand &&
    hand.phase === GamePhase.Shuffling &&
    myOccupiedIndex === hand.shuffleProgress;

  // Initialize Web Worker (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      workerRef.current = new Worker(
        new URL("../lib/noir/worker.ts", import.meta.url),
        { type: "module" },
      );

      workerRef.current.onmessage = (e) => {
        if (e.data.type === "progress") {
          setShuffleProgress(e.data.value);
        }
      };
    } catch (err) {
      console.warn("Failed to create shuffle worker:", err);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Auto-shuffle when it's our turn
  useEffect(() => {
    if (!isMyTurnToShuffle || !session || !currentDeckData || !hand) return;
    if (shuffledHandRef.current === hand.handId) return;
    if (isShuffling) return;

    const doShuffle = async () => {
      setIsShuffling(true);
      setShuffleProgress(0);
      setError(null);
      shuffledHandRef.current = hand.handId;

      try {
        // Parse the current deck from felt252 string array
        const deck = deserializeDeck(currentDeckData);

        // Shuffle and re-encrypt
        const { serializedDeck, proofInputs } = session.shuffleDeck(deck);
        setShuffleProgress(20);

        // Generate proof in Web Worker
        const proof = await generateShuffleProof(proofInputs);
        setShuffleProgress(90);

        // Submit to chain
        await submitShuffle(
          hand.handId,
          serializedDeck,
          proof,
        );
        setShuffleProgress(100);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Shuffle failed");
        shuffledHandRef.current = 0; // Allow retry
      } finally {
        setIsShuffling(false);
      }
    };

    doShuffle();
  }, [isMyTurnToShuffle, session, currentDeckData, hand, isShuffling, submitShuffle]);

  const generateShuffleProof = useCallback(
    async (inputs: Record<string, unknown>): Promise<string[]> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error("Worker not initialized"));
          return;
        }

        const handler = (e: MessageEvent) => {
          if (e.data.type === "proof_ready") {
            workerRef.current?.removeEventListener("message", handler);
            resolve(e.data.calldata as string[]);
          } else if (e.data.type === "error") {
            workerRef.current?.removeEventListener("message", handler);
            reject(new Error(e.data.error));
          } else if (e.data.type === "progress") {
            setShuffleProgress(20 + Math.floor(e.data.value * 0.7));
          }
        };

        workerRef.current.addEventListener("message", handler);
        workerRef.current.postMessage({
          type: "prove",
          circuitType: "shuffle",
          inputs,
        });
      });
    },
    [],
  );

  return {
    isMyTurnToShuffle,
    isShuffling,
    shuffleProgress,
    error,
  };
}
