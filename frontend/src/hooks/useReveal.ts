"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MentalPokerSession } from "@/lib/cards/mental-poker";
import { proofToGaragaCalldata } from "@/lib/garaga/calldata";
import { GamePhase } from "@/lib/constants";
import type { HandData, PlayerHandData, SeatData, CommunityCardsData, RevealTokenData } from "@/lib/types";

interface UseRevealOptions {
  hand: HandData | undefined;
  playerHands: PlayerHandData[];
  communityCards: CommunityCardsData | undefined;
  seats: SeatData[];
  myAddress: string | null;
  session: MentalPokerSession | null;
  submitRevealToken: (
    handId: number,
    cardPosition: number,
    tokenX: string,
    tokenY: string,
    proof: string[],
  ) => Promise<void>;
  submitCardDecryption: (
    handId: number,
    cardPosition: number,
    cardId: number,
  ) => Promise<void>;
  // Raw data from Torii
  currentDeckData: string[] | null;
  revealTokens: RevealTokenData[];
}

interface UseRevealReturn {
  myHoleCards: [number, number] | null; // Decrypted card IDs
  isRevealing: boolean;
  revealProgress: number;
  error: string | null;
}

const DEALING_PHASES = [
  GamePhase.DealingPreflop,
  GamePhase.DealingFlop,
  GamePhase.DealingTurn,
  GamePhase.DealingRiver,
];

export function useReveal({
  hand,
  playerHands,
  communityCards,
  seats,
  myAddress,
  session,
  submitRevealToken,
  submitCardDecryption,
  currentDeckData,
  revealTokens,
}: UseRevealOptions): UseRevealReturn {
  const [myHoleCards, setMyHoleCards] = useState<[number, number] | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealProgress, setRevealProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const revealedPhasesRef = useRef<Set<string>>(new Set());

  const mySeat = seats.find(
    (s) => s.player.toLowerCase() === myAddress?.toLowerCase()
  );
  const myPlayerHand = playerHands.find(
    (ph) => ph.player.toLowerCase() === myAddress?.toLowerCase()
  );

  // Initialize Web Worker for decrypt proofs (client-side only)
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
        }
      };

      // Send init message — worker requires this before any prove message
      workerRef.current.postMessage({ type: "init", circuit: "decrypt" });
    } catch (err) {
      console.warn("Failed to create decrypt worker:", err);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      workerReadyRef.current = false;
    };
  }, []);

  // Auto-submit reveal tokens when in a dealing phase
  useEffect(() => {
    if (!hand || !session || !mySeat || !currentDeckData) return;
    if (!DEALING_PHASES.includes(hand.phase as GamePhase)) return;

    const phaseKey = `${hand.handId}-${hand.phase}`;
    if (revealedPhasesRef.current.has(phaseKey)) return;
    if (isRevealing) return;

    const doReveal = async () => {
      setIsRevealing(true);
      setRevealProgress(0);
      setError(null);
      revealedPhasesRef.current.add(phaseKey);

      try {
        // Load the current deck into session
        session.loadDeck(currentDeckData);

        // Determine which card positions we need to reveal for
        const positions = getPositionsForPhase(
          hand.phase as GamePhase,
          mySeat.seatIndex,
          playerHands,
          communityCards,
        );

        const total = positions.length;
        let completed = 0;

        for (const pos of positions) {
          const { token, proofInputs } = session.computeRevealTokenForCard(pos);

          // Generate decrypt proof
          const proof = await generateDecryptProof(proofInputs);

          // Submit to chain
          await submitRevealToken(
            hand.handId,
            pos,
            token.x.toString(),
            token.y.toString(),
            proof,
          );

          completed++;
          setRevealProgress(Math.floor((completed / total) * 100));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reveal failed");
        revealedPhasesRef.current.delete(phaseKey);
      } finally {
        setIsRevealing(false);
      }
    };

    doReveal();
  }, [hand, session, mySeat, currentDeckData, playerHands, communityCards, isRevealing, submitRevealToken]);

  // Decrypt hole cards when we have all tokens for our positions
  useEffect(() => {
    if (!session || !myPlayerHand || !currentDeckData || !mySeat) return;
    if (myHoleCards !== null) return;

    const pos1 = myPlayerHand.holeCard1Pos;
    const pos2 = myPlayerHand.holeCard2Pos;
    // Positions are valid if the PlayerHand has a non-zero player address.
    // Don't use (pos === 0) as a sentinel — 0 is a valid deck position.
    if (!myPlayerHand.player || myPlayerHand.player === "0x0") return;

    // A-05 FIX: Use numPlayers (all original hand participants) instead of active players.
    // In n-of-n aggregate-key ElGamal, ALL players' tokens are needed for decryption,
    // regardless of fold status.
    const numPlayers = hand?.numPlayers ?? 0;
    const requiredTokens = numPlayers > 0 ? numPlayers - 1 : 0; // Everyone except us

    const tokensForCard1 = revealTokens.filter(
      (t) => t.handId === myPlayerHand.handId && t.cardPosition === pos1 && t.proofVerified
    );
    const tokensForCard2 = revealTokens.filter(
      (t) => t.handId === myPlayerHand.handId && t.cardPosition === pos2 && t.proofVerified
    );

    if (tokensForCard1.length < requiredTokens || tokensForCard2.length < requiredTokens) return;

    try {
      session.loadDeck(currentDeckData);

      const tokens1 = tokensForCard1.map((t) => ({
        x: BigInt(t.tokenX),
        y: BigInt(t.tokenY),
      }));
      const tokens2 = tokensForCard2.map((t) => ({
        x: BigInt(t.tokenX),
        y: BigInt(t.tokenY),
      }));

      const card1 = session.decryptCard(pos1, tokens1);
      const card2 = session.decryptCard(pos2, tokens2);

      if (card1 >= 0 && card2 >= 0) {
        setMyHoleCards([card1, card2]);
      }
    } catch (err) {
      console.error("Card decryption failed:", err);
    }
  }, [session, myPlayerHand, currentDeckData, revealTokens, mySeat, playerHands, myHoleCards, hand]);

  // Auto-submit card decryption votes during Showdown phase
  // Each player decrypts all visible cards and submits the card_id for consensus
  const submittedDecryptionsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hand || !session || !mySeat || !currentDeckData) return;
    if (hand.phase !== GamePhase.Showdown) return;

    const doSubmitDecryptions = async () => {
      try {
        session.loadDeck(currentDeckData);

        // Collect all card positions that need consensus (community + non-folded hole cards)
        const positions: number[] = [];

        if (communityCards) {
          positions.push(
            communityCards.flop1Pos,
            communityCards.flop2Pos,
            communityCards.flop3Pos,
            communityCards.turnPos,
            communityCards.riverPos,
          );
        }

        for (const ph of playerHands) {
          if (ph.hasFolded || ph.player === "" || ph.player === "0x0") continue;
          positions.push(ph.holeCard1Pos, ph.holeCard2Pos);
        }

        // A-05 FIX: Use numPlayers (all original hand participants) for token requirements.
        // In n-of-n ElGamal, ALL players' tokens are needed regardless of fold status.
        const numPlayers = hand.numPlayers ?? 0;

        for (const pos of positions) {
          const key = `${hand.handId}-${pos}`;
          if (submittedDecryptionsRef.current.has(key)) continue;

          // Check if we have enough reveal tokens for this position
          const tokensForPos = revealTokens.filter(
            (t) => t.handId === hand.handId && t.cardPosition === pos && t.proofVerified,
          );

          // Community cards need all players' tokens; hole cards need (all - 1)
          const isCommunity =
            communityCards &&
            (pos === communityCards.flop1Pos ||
              pos === communityCards.flop2Pos ||
              pos === communityCards.flop3Pos ||
              pos === communityCards.turnPos ||
              pos === communityCards.riverPos);
          const required = isCommunity ? numPlayers : (numPlayers > 0 ? numPlayers - 1 : 0);

          if (tokensForPos.length < required) continue;

          // Decrypt the card
          const tokens = tokensForPos.map((t) => ({
            x: BigInt(t.tokenX),
            y: BigInt(t.tokenY),
          }));
          const cardId = session.decryptCard(pos, tokens);
          if (cardId < 0) continue;

          submittedDecryptionsRef.current.add(key);
          await submitCardDecryption(hand.handId, pos, cardId);
        }
      } catch (err) {
        console.error("Card decryption vote submission failed:", err);
      }
    };

    doSubmitDecryptions();
  }, [hand, session, mySeat, currentDeckData, playerHands, communityCards, revealTokens, submitCardDecryption]);

  // Reset on new hand
  useEffect(() => {
    if (hand) {
      setMyHoleCards(null);
      revealedPhasesRef.current.clear();
      submittedDecryptionsRef.current.clear();
    }
  }, [hand?.handId]);

  const generateDecryptProof = useCallback(
    async (inputs: Record<string, string>): Promise<string[]> => {
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
      const { calldata } = await proofToGaragaCalldata(rawProof, "decrypt");
      return calldata;
    },
    [],
  );

  return {
    myHoleCards,
    isRevealing,
    revealProgress,
    error,
  };
}

function getPositionsForPhase(
  phase: GamePhase,
  mySeatIndex: number,
  playerHands: PlayerHandData[],
  communityCards: CommunityCardsData | undefined,
): number[] {
  const positions: number[] = [];

  if (phase === GamePhase.DealingPreflop) {
    for (const ph of playerHands) {
      if (ph.seatIndex === mySeatIndex) continue;
      if (ph.player === "" || ph.player === "0x0") continue;
      positions.push(ph.holeCard1Pos, ph.holeCard2Pos);
    }
  } else if (phase === GamePhase.DealingFlop && communityCards) {
    positions.push(communityCards.flop1Pos, communityCards.flop2Pos, communityCards.flop3Pos);
  } else if (phase === GamePhase.DealingTurn && communityCards) {
    positions.push(communityCards.turnPos);
  } else if (phase === GamePhase.DealingRiver && communityCards) {
    positions.push(communityCards.riverPos);
  }

  return positions;
}
