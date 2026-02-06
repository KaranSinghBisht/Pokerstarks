"use client";

import { useCallback } from "react";
import { Contract, AccountInterface, CallData } from "starknet";
import { PlayerAction } from "@/lib/constants";
import { WORLD_ADDRESS, NAMESPACE } from "@/lib/dojo-config";

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
    newDeck: string[],
    proof: string[],
    verifierAddress: string,
  ) => Promise<void>;
  submitRevealToken: (
    handId: number,
    cardPosition: number,
    tokenX: string,
    tokenY: string,
    proof: string[],
  ) => Promise<void>;
  startHand: () => Promise<void>;
}

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
): UsePokerActionsReturn {
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

  const submitShuffle = useCallback(
    async (
      handId: number,
      newDeck: string[],
      proof: string[],
      verifierAddress: string,
    ) => {
      await executeCall(
        account ?? null,
        CONTRACTS.shuffle,
        "submit_shuffle",
        [handId, ...newDeck, ...proof, verifierAddress],
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
      await executeCall(
        account ?? null,
        CONTRACTS.dealing,
        "submit_reveal_token",
        [handId, cardPosition, tokenX, tokenY, ...proof],
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
    submitShuffle,
    submitRevealToken,
    startHand,
  };
}
