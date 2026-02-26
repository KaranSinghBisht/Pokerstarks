"use client";

import { useCallback } from "react";
import { AccountInterface, CallData } from "starknet";
import { PlayerAction, CHIP_TOKEN_ADDRESS } from "@/lib/constants";
import { getSystemAddress } from "@/lib/contracts";

/** Returns true if the address is effectively 0x0 (zero address = play money). */
function isZeroAddress(addr: string): boolean {
  if (!addr) return true;
  try {
    return BigInt(addr) === 0n;
  } catch {
    return false;
  }
}

// Helper: execute a Dojo system call via starknet.js
async function executeCall(
  account: AccountInterface | null,
  contractAddress: string,
  entrypoint: string,
  calldata: (string | number | bigint)[],
) {
  if (!account) {
    throw new Error("Wallet not connected.");
  }
  if (!contractAddress) {
    throw new Error(`Missing contract address for ${entrypoint}.`);
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
  const contracts = {
    lobby: getSystemAddress("lobby"),
    betting: getSystemAddress("betting"),
    game_setup: getSystemAddress("game_setup"),
    shuffle: getSystemAddress("shuffle"),
    dealing: getSystemAddress("dealing"),
    showdown: getSystemAddress("showdown"),
    settle: getSystemAddress("settle"),
    timeout: getSystemAddress("timeout"),
  };

  const submitAction = useCallback(
    async (handId: number, action: PlayerAction, amount: bigint) => {
      await executeCall(account ?? null, contracts.betting, "player_action", [
        handId,
        action,
        amount,
      ]);
    },
    [account, contracts.betting],
  );

  const setReady = useCallback(async () => {
    await executeCall(account ?? null, contracts.lobby, "set_ready", [tableId]);
  }, [tableId, account, contracts.lobby]);

  const joinTable = useCallback(
    async (seatIndex: number, buyIn: bigint, inviteCode: string = "0", tokenAddress?: string) => {
      // Use the table's explicit token; only fall back to global CHIP_TOKEN_ADDRESS
      // when no token address was provided at all (undefined).
      const resolvedToken = tokenAddress !== undefined ? tokenAddress : CHIP_TOKEN_ADDRESS;
      const lobbyAddr = contracts.lobby;
      if (!account) throw new Error("Wallet not connected.");
      if (!lobbyAddr) throw new Error("Missing contract address for join_table.");

      // If a real token is configured, multicall: approve + join_table
      if (resolvedToken && !isZeroAddress(resolvedToken)) {
        const result = await account.execute([
          {
            contractAddress: resolvedToken,
            entrypoint: "approve",
            calldata: CallData.compile([lobbyAddr, buyIn, 0].map(String)),
          },
          {
            contractAddress: lobbyAddr,
            entrypoint: "join_table",
            calldata: CallData.compile([tableId, buyIn, seatIndex, inviteCode].map(String)),
          },
        ]);
        console.log(`TX: approve+join_table -> ${result.transaction_hash}`);
        return result;
      }

      // Fallback: plain join (play money)
      await executeCall(account, lobbyAddr, "join_table", [
        tableId,
        buyIn,
        seatIndex,
        inviteCode,
      ]);
    },
    [tableId, account, contracts.lobby],
  );

  const leaveTable = useCallback(async () => {
    await executeCall(account ?? null, contracts.lobby, "leave_table", [
      tableId,
    ]);
  }, [tableId, account, contracts.lobby]);

  const submitPublicKey = useCallback(
    async (handId: number, pkX: string, pkY: string) => {
      await executeCall(
        account ?? null,
        contracts.game_setup,
        "submit_public_key",
        [handId, pkX, pkY],
      );
    },
    [account, contracts.game_setup],
  );

  const submitAggregateKey = useCallback(
    async (handId: number, aggPkX: string, aggPkY: string) => {
      await executeCall(
        account ?? null,
        contracts.game_setup,
        "submit_aggregate_key",
        [handId, aggPkX, aggPkY],
      );
    },
    [account, contracts.game_setup],
  );

  const submitInitialDeckHash = useCallback(
    async (handId: number, deckHash: string) => {
      await executeCall(
        account ?? null,
        contracts.game_setup,
        "submit_initial_deck_hash",
        [handId, deckHash],
      );
    },
    [account, contracts.game_setup],
  );

  const submitInitialDeck = useCallback(
    async (handId: number, deck: string[]) => {
      // Cairo Array<felt252> calldata: [length, ...elements]
      await executeCall(
        account ?? null,
        contracts.game_setup,
        "submit_initial_deck",
        [handId, deck.length, ...deck],
      );
    },
    [account, contracts.game_setup],
  );

  const submitShuffle = useCallback(
    async (handId: number, newDeck: string[], proof: string[]) => {
      // Cairo Array<felt252> calldata: [length, ...elements]
      await executeCall(
        account ?? null,
        contracts.shuffle,
        "submit_shuffle",
        [handId, newDeck.length, ...newDeck, proof.length, ...proof],
      );
    },
    [account, contracts.shuffle],
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
        contracts.dealing,
        "submit_reveal_token",
        [handId, cardPosition, tokenX, tokenY, proof.length, ...proof],
      );
    },
    [account, contracts.dealing],
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
        contracts.dealing,
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
    [account, contracts.dealing],
  );

  const submitCardDecryption = useCallback(
    async (handId: number, cardPosition: number, cardId: number) => {
      await executeCall(
        account ?? null,
        contracts.showdown,
        "submit_card_decryption",
        [handId, cardPosition, cardId],
      );
    },
    [account, contracts.showdown],
  );

  const computeWinner = useCallback(
    async (handId: number) => {
      await executeCall(
        account ?? null,
        contracts.showdown,
        "compute_winner",
        [handId],
      );
    },
    [account, contracts.showdown],
  );

  const distributePot = useCallback(
    async (handId: number) => {
      await executeCall(
        account ?? null,
        contracts.settle,
        "distribute_pot",
        [handId],
      );
    },
    [account, contracts.settle],
  );

  const startHand = useCallback(async () => {
    await executeCall(account ?? null, contracts.game_setup, "start_hand", [
      tableId,
    ]);
  }, [tableId, account, contracts.game_setup]);

  const enforceTimeout = useCallback(
    async (handId: number) => {
      await executeCall(
        account ?? null,
        contracts.timeout,
        "enforce_timeout",
        [handId],
      );
    },
    [account, contracts.timeout],
  );

  return {
    submitAction,
    setReady,
    joinTable,
    leaveTable,
    submitPublicKey,
    submitAggregateKey,
    submitInitialDeckHash,
    submitInitialDeck,
    submitShuffle,
    submitRevealToken,
    submitRevealTokensBatch,
    submitCardDecryption,
    computeWinner,
    distributePot,
    startHand,
    enforceTimeout,
  };
}
