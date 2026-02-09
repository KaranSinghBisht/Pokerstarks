"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MentalPokerSession } from "@/lib/cards/mental-poker";
import { deserializeDeck } from "@/lib/noir/shuffle";
import { proofToGaragaCalldata } from "@/lib/garaga/calldata";
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
  const workerReadyRef = useRef(false);
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
        if (e.data.type === "ready") {
          workerReadyRef.current = true;
        } else if (e.data.type === "progress") {
          setShuffleProgress(e.data.value);
        }
      };

      // Send init message — worker requires this before any prove message
      workerRef.current.postMessage({ type: "init", circuit: "shuffle" });
    } catch (err) {
      console.warn("Failed to create shuffle worker:", err);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      workerReadyRef.current = false;
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
      // Step 1: Generate raw proof in Web Worker
      const rawProof = await new Promise<{ proof: Uint8Array; publicInputs: string[] }>(
        (resolve, reject) => {
          if (!workerRef.current || !workerReadyRef.current) {
            reject(new Error("Worker not initialized. Wait for init to complete."));
            return;
          }

          const handler = (e: MessageEvent) => {
            if (e.data.type === "proof_ready") {
              workerRef.current?.removeEventListener("message", handler);
              resolve({
                proof: e.data.proof as Uint8Array,
                publicInputs: e.data.publicInputs as string[],
              });
            } else if (e.data.type === "error") {
              workerRef.current?.removeEventListener("message", handler);
              reject(new Error(e.data.message));
            } else if (e.data.type === "progress") {
              setShuffleProgress(20 + Math.floor(e.data.value * 0.5));
            }
          };

          workerRef.current.addEventListener("message", handler);
          workerRef.current.postMessage({
            type: "prove",
            inputs,
          });
        },
      );

      // Step 2: Convert raw proof to Garaga calldata (MSM/KZG hints)
      setShuffleProgress(75);
      const { calldata } = await proofToGaragaCalldata(rawProof, "shuffle");
      setShuffleProgress(85);
      return calldata;
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
