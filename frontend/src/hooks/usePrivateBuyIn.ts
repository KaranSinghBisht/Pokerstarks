"use client";

import { useState, useCallback } from "react";
import { CallData } from "starknet";
import type { AccountInterface } from "starknet";
import type { UseTongoReturn } from "./useTongo";
import { STRK_TOKEN_ADDRESS, TONGO_STRK_RATE } from "@/lib/constants";
import { getSystemAddress } from "@/lib/contracts";

export type PrivateBuyInStep = "idle" | "withdrawing" | "joining" | "done" | "error";

export interface UsePrivateBuyInReturn {
  privateBuyIn: (
    tableId: number,
    seatIndex: number,
    buyInWei: bigint,
    inviteCode: string,
  ) => Promise<void>;
  step: PrivateBuyInStep;
  loading: boolean;
  error: string | null;
  reset: () => void;
}

export function usePrivateBuyIn(
  tongo: UseTongoReturn,
  account: AccountInterface | null,
  walletAddress: string | null,
): UsePrivateBuyInReturn {
  const [step, setStep] = useState<PrivateBuyInStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
  }, []);

  const privateBuyIn = useCallback(
    async (
      tableId: number,
      seatIndex: number,
      buyInWei: bigint,
      inviteCode: string,
    ) => {
      if (!tongo.isAvailable) {
        setError("Tongo wallet not available");
        setStep("error");
        return;
      }
      if (!account || !walletAddress) {
        setError("Wallet not connected");
        setStep("error");
        return;
      }

      const lobbyAddr = getSystemAddress("lobby");
      if (!lobbyAddr) {
        setError("Lobby contract address not configured");
        setStep("error");
        return;
      }

      try {
        // Step 1: Withdraw from Tongo (unshield STRK to wallet)
        setStep("withdrawing");
        setError(null);

        const tongoUnits = buyInWei / TONGO_STRK_RATE;
        if (tongoUnits <= 0n) {
          throw new Error("Buy-in amount too small for Tongo withdrawal");
        }

        // Check Tongo balance
        if (tongo.balance !== null && tongo.balance < tongoUnits) {
          throw new Error(
            `Insufficient Tongo balance. Need ${tongoUnits} units, have ${tongo.balance}`,
          );
        }

        await tongo.withdraw(tongoUnits, walletAddress);

        // Step 2: Approve STRK + join table (multicall)
        setStep("joining");

        await account.execute([
          {
            contractAddress: STRK_TOKEN_ADDRESS,
            entrypoint: "approve",
            calldata: CallData.compile([lobbyAddr, buyInWei, 0].map(String)),
          },
          {
            contractAddress: lobbyAddr,
            entrypoint: "join_table",
            calldata: CallData.compile(
              [tableId, buyInWei, seatIndex, inviteCode].map(String),
            ),
          },
        ]);

        setStep("done");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Private buy-in failed";
        setError(msg);
        setStep("error");
        throw err;
      }
    },
    [tongo, account, walletAddress],
  );

  return {
    privateBuyIn,
    step,
    loading: step === "withdrawing" || step === "joining",
    error,
    reset,
  };
}
