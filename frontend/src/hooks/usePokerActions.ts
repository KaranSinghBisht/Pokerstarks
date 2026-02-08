"use client";

import { useCallback } from "react";
import { AccountInterface, CallData } from "starknet";
import { PlayerAction } from "@/lib/constants";

// Contract addresses are set after deployment
// In production these come from the manifest or env vars
const CONTRACTS: Record<string, string> = {
  lobby: process.env.NEXT_PUBLIC_LOBBY_ADDRESS || "",
  betting: process.env.NEXT_PUBLIC_BETTING_ADDRESS || "",
  game_setup: process.env.NEXT_PUBLIC_GAME_SETUP_ADDRESS || "",
  shuffle: process.env.NEXT_PUBLIC_SHUFFLE_ADDRESS || "",
  dealing: process.env.NEXT_PUBLIC_DEALING_ADDRESS || "",
  showdown: process.env.NEXT_PUBLIC_SHOWDOWN_ADDRESS || "",
  settle: process.env.NEXT_PUBLIC_SETTLE_ADDRESS || "",
};

// Helper: execute a Dojo system call via starknet.js
async function executeCall(
  account: AccountInterface | null,
  contractAddress: string,
  entrypoint: string,
  calldata: (string | number | bigint)[],
) {
  if (!account) {
    console.warn(`No account connected, logging: ${entrypoint}(${calldata})`);
    return;
  }
  if (!contractAddress) {
    console.warn(`Contract address not set for ${entrypoint}, logging only`);
    return;
  }
  const result = await account.execute({
    contractAddress,
    entrypoint,
    calldata: CallData.compile(calldata.map(String)),
  });
  console.log(`TX: ${entrypoint} -> ${result.transaction_hash}`);
  return result;
}

export function usePokerActions(
  tableId: number,
  account?: AccountInterface | null,
) {
  const submitAction = useCallback(
    async (handId: number, action: PlayerAction, amount: bigint) => {
      await executeCall(account ?? null, CONTRACTS.betting, "player_action", [
        handId,
        action,
        amount,
      ]);
    },
    [account],
  );

  const setReady = useCallback(async () => {
    await executeCall(account ?? null, CONTRACTS.lobby, "set_ready", [tableId]);
  }, [tableId, account]);

  const joinTable = useCallback(
    async (seatIndex: number, buyIn: bigint) => {
      await executeCall(account ?? null, CONTRACTS.lobby, "join_table", [
        tableId,
        buyIn,
        seatIndex,
      ]);
    },
    [tableId, account],
  );

  const leaveTable = useCallback(async () => {
    await executeCall(account ?? null, CONTRACTS.lobby, "leave_table", [
      tableId,
    ]);
  }, [tableId, account]);

  const submitPublicKey = useCallback(
    async (handId: number, pkX: string, pkY: string) => {
      await executeCall(
        account ?? null,
        CONTRACTS.game_setup,
        "submit_public_key",
        [handId, pkX, pkY],
      );
    },
    [account],
  );

  const submitAggregateKey = useCallback(
    async (handId: number, aggPkX: string, aggPkY: string) => {
      await executeCall(
        account ?? null,
        CONTRACTS.game_setup,
        "submit_aggregate_key",
        [handId, aggPkX, aggPkY],
      );
    },
    [account],
  );

  const submitInitialDeck = useCallback(
    async (handId: number, deck: string[]) => {
      // Cairo Array<felt252> calldata: [length, ...elements]
      await executeCall(
        account ?? null,
        CONTRACTS.game_setup,
        "submit_initial_deck",
        [handId, deck.length, ...deck],
      );
    },
    [account],
  );

  const submitShuffle = useCallback(
    async (handId: number, newDeck: string[], proof: string[]) => {
      // Cairo Array<felt252> calldata: [length, ...elements]
      await executeCall(
        account ?? null,
        CONTRACTS.shuffle,
        "submit_shuffle",
        [handId, newDeck.length, ...newDeck, proof.length, ...proof],
      );
    },
    [account],
  );

  const submitRevealToken = useCallback(
    async (
      handId: number,
      cardPosition: number,
      tokenX: string,
      tokenY: string,
      proof: string[],
    ) => {
      // Cairo Array<felt252> calldata: [length, ...elements]
      await executeCall(
        account ?? null,
        CONTRACTS.dealing,
        "submit_reveal_token",
        [handId, cardPosition, tokenX, tokenY, proof.length, ...proof],
      );
    },
    [account],
  );

  const submitRevealTokensBatch = useCallback(
    async (
      handId: number,
      positions: number[],
      tokensX: string[],
      tokensY: string[],
      proofs: string[][],
    ) => {
      // Nested Array<Array<felt252>>: [outer_len, inner_len_1, ...elems_1, ...]
      const flatProofs: (string | number)[] = [proofs.length];
      for (const p of proofs) {
        flatProofs.push(p.length, ...p);
      }
      await executeCall(
        account ?? null,
        CONTRACTS.dealing,
        "submit_reveal_tokens_batch",
        [
          handId,
          positions.length, ...positions,
          tokensX.length, ...tokensX,
          tokensY.length, ...tokensY,
          ...flatProofs,
        ],
      );
    },
    [account],
  );

  const revealHand = useCallback(
    async (handId: number, card1Id: number, card2Id: number) => {
      await executeCall(
        account ?? null,
        CONTRACTS.showdown,
        "reveal_hand",
        [handId, card1Id, card2Id],
      );
    },
    [account],
  );

  const setCommunityCards = useCallback(
    async (
      handId: number,
      flop1: number, flop2: number, flop3: number,
      turnCard: number, riverCard: number,
    ) => {
      await executeCall(
        account ?? null,
        CONTRACTS.showdown,
        "set_community_cards",
        [handId, flop1, flop2, flop3, turnCard, riverCard],
      );
    },
    [account],
  );

  const computeWinner = useCallback(
    async (handId: number) => {
      await executeCall(
        account ?? null,
        CONTRACTS.showdown,
        "compute_winner",
        [handId],
      );
    },
    [account],
  );

  const distributePot = useCallback(
    async (handId: number) => {
      await executeCall(
        account ?? null,
        CONTRACTS.settle,
        "distribute_pot",
        [handId],
      );
    },
    [account],
  );

  const startHand = useCallback(async () => {
    await executeCall(account ?? null, CONTRACTS.game_setup, "start_hand", [
      tableId,
    ]);
  }, [tableId, account]);

  return {
    submitAction,
    setReady,
    joinTable,
    leaveTable,
    submitPublicKey,
    submitAggregateKey,
    submitInitialDeck,
    submitShuffle,
    submitRevealToken,
    submitRevealTokensBatch,
    revealHand,
    setCommunityCards,
    computeWinner,
    distributePot,
    startHand,
  };
}
