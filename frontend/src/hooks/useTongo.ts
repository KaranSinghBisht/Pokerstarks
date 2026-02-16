"use client";

import { useState, useCallback } from "react";

// Tongo confidential ERC20 integration
// Uses @fatsolutions/tongo-sdk for privacy-preserving chip balances
// Fallback: standard on-chain chips if Tongo is not available

interface UseTongoReturn {
  isAvailable: boolean;
  confidentialBalance: bigint | null;
  loading: boolean;
  fund: (amount: bigint) => Promise<void>;
  withdraw: (amount: bigint) => Promise<void>;
  transfer: (recipient: string, amount: bigint) => Promise<void>;
}

export function useTongo(tokenAddress?: string): UseTongoReturn {
  const [loading, setLoading] = useState(false);
  const [confidentialBalance] = useState<bigint | null>(null);

  // TODO: Initialize Tongo SDK when available
  // import { Account as TongoAccount } from "@fatsolutions/tongo-sdk";
  // const tongoAccount = new TongoAccount(privateKey, tongoAddress, provider);

  const isAvailable = false; // Set to true when Tongo SDK is integrated

  const fund = useCallback(
    async (amount: bigint) => {
      if (!tokenAddress) return;
      setLoading(true);
      try {
        throw new Error(
          "Tongo integration is not enabled in this build. Use standard on-chain chip balances.",
        );
      } finally {
        setLoading(false);
      }
    },
    [tokenAddress],
  );

  const withdraw = useCallback(
    async (amount: bigint) => {
      if (!tokenAddress) return;
      setLoading(true);
      try {
        throw new Error(
          "Tongo integration is not enabled in this build. Use standard on-chain chip balances.",
        );
      } finally {
        setLoading(false);
      }
    },
    [tokenAddress],
  );

  const transfer = useCallback(
    async (recipient: string, amount: bigint) => {
      if (!tokenAddress) return;
      setLoading(true);
      try {
        void recipient;
        void amount;
        throw new Error(
          "Tongo integration is not enabled in this build. Use standard on-chain chip balances.",
        );
      } finally {
        setLoading(false);
      }
    },
    [tokenAddress],
  );

  return {
    isAvailable,
    confidentialBalance,
    loading,
    fund,
    withdraw,
    transfer,
  };
}
