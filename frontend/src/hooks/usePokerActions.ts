"use client";

import { useCallback } from "react";
import { PlayerAction } from "@/lib/constants";

interface UsePokerActionsReturn {
  submitAction: (
    handId: number,
    action: PlayerAction,
    amount: bigint,
  ) => Promise<void>;
  setReady: () => Promise<void>;
  joinTable: (seatIndex: number, buyIn: bigint) => Promise<void>;
  leaveTable: () => Promise<void>;
  submitPublicKey: (
    handId: number,
    pkX: string,
    pkY: string,
  ) => Promise<void>;
  submitShuffle: (
    handId: number,
    proof: Uint8Array,
    newDeck: string[],
  ) => Promise<void>;
  submitRevealToken: (
    handId: number,
    cardPosition: number,
    tokenX: string,
    tokenY: string,
    proof: Uint8Array,
  ) => Promise<void>;
}

export function usePokerActions(tableId: number): UsePokerActionsReturn {
  // TODO: Replace with actual Dojo SDK contract calls
  // const { account } = useAccount();
  // const { execute } = useDojo();

  const submitAction = useCallback(
    async (handId: number, action: PlayerAction, amount: bigint) => {
      console.log(
        `[Table ${tableId}] Action: hand=${handId} action=${PlayerAction[action]} amount=${amount}`,
      );
      // await execute("pokerstarks", "betting_system", "player_action", [
      //   handId, action, amount
      // ]);
    },
    [tableId],
  );

  const setReady = useCallback(async () => {
    console.log(`[Table ${tableId}] Set ready`);
    // await execute("pokerstarks", "lobby_system", "set_ready", [tableId]);
  }, [tableId]);

  const joinTable = useCallback(
    async (seatIndex: number, buyIn: bigint) => {
      console.log(
        `[Table ${tableId}] Join: seat=${seatIndex} buyIn=${buyIn}`,
      );
      // await execute("pokerstarks", "lobby_system", "join_table", [
      //   tableId, seatIndex, buyIn
      // ]);
    },
    [tableId],
  );

  const leaveTable = useCallback(async () => {
    console.log(`[Table ${tableId}] Leave`);
    // await execute("pokerstarks", "lobby_system", "leave_table", [tableId]);
  }, [tableId]);

  const submitPublicKey = useCallback(
    async (handId: number, pkX: string, pkY: string) => {
      console.log(
        `[Table ${tableId}] Submit PK: hand=${handId}`,
      );
      // await execute("pokerstarks", "game_setup_system", "submit_public_key", [
      //   handId, pkX, pkY
      // ]);
    },
    [tableId],
  );

  const submitShuffle = useCallback(
    async (handId: number, proof: Uint8Array, newDeck: string[]) => {
      console.log(
        `[Table ${tableId}] Submit shuffle: hand=${handId} deckLen=${newDeck.length}`,
      );
      // await execute("pokerstarks", "shuffle_system", "submit_shuffle", [
      //   handId, proof, newDeck
      // ]);
    },
    [tableId],
  );

  const submitRevealToken = useCallback(
    async (
      handId: number,
      cardPosition: number,
      tokenX: string,
      tokenY: string,
      proof: Uint8Array,
    ) => {
      console.log(
        `[Table ${tableId}] Submit reveal: hand=${handId} pos=${cardPosition}`,
      );
      // await execute("pokerstarks", "dealing_system", "submit_reveal_token", [
      //   handId, cardPosition, tokenX, tokenY, proof
      // ]);
    },
    [tableId],
  );

  return {
    submitAction,
    setReady,
    joinTable,
    leaveTable,
    submitPublicKey,
    submitShuffle,
    submitRevealToken,
  };
}
