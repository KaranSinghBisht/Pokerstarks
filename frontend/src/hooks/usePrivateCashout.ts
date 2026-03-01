"use client";

import { useState, useCallback } from "react";
import type { UseTongoReturn } from "./useTongo";
import { TONGO_STRK_RATE } from "@/lib/constants";

export type PrivateCashoutStep = "idle" | "cashing-out" | "shielding" | "done" | "error";

export interface UsePrivateCashoutReturn {
  privateCashout: (
    tableId: number,
    chipAmount: bigint,
    leaveTable: () => Promise<void>,
  ) => Promise<void>;
  step: PrivateCashoutStep;
  loading: boolean;
  error: string | null;
  reset: () => void;
}

export function usePrivateCashout(
  tongo: UseTongoReturn,
): UsePrivateCashoutReturn {
  const [step, setStep] = useState<PrivateCashoutStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
  }, []);

  const privateCashout = useCallback(
    async (
      _tableId: number,
      chipAmount: bigint,
      leaveTable: () => Promise<void>,
    ) => {
      if (!tongo.isAvailable) {
        setError("Tongo wallet not available");
        setStep("error");
        return;
      }

      try {
        // Step 1: Leave the table (STRK returns to wallet)
        setStep("cashing-out");
        setError(null);

        await leaveTable();

        // Step 2: Shield the STRK back into Tongo
        setStep("shielding");

        const tongoUnits = chipAmount / TONGO_STRK_RATE;
        if (tongoUnits > 0n) {
          await tongo.fund(tongoUnits);
        }

        setStep("done");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Private cashout failed";
        setError(msg);
        setStep("error");
        throw err;
      }
    },
    [tongo],
  );

  return {
    privateCashout,
    step,
    loading: step === "cashing-out" || step === "shielding",
    error,
    reset,
  };
}
