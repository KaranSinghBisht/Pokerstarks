"use client";

import { useState, useEffect, useRef } from "react";
import type { WalletInterface } from "starkzap";

/** Token balances from StarkZap wallet */
export interface StarkZapTokenBalances {
  strk: string | null;
  eth: string | null;
  loading: boolean;
}

export function useStarkZapTokens(
  wallet: WalletInterface | null,
): StarkZapTokenBalances {
  const [strk, setStrk] = useState<string | null>(null);
  const [eth, setEth] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  useEffect(() => {
    if (!wallet) {
      setStrk(null);
      setEth(null);
      return;
    }

    let cancelled = false;

    async function fetchBalances() {
      setLoading(true);
      try {
        // Dynamic import to avoid SSR issues — starkzap is ESM-only
        const { getPresets } = await import("starkzap");
        const w = walletRef.current;
        if (!w || cancelled) return;

        const presets = getPresets(w.getChainId());

        const [strkBal, ethBal] = await Promise.all([
          w.balanceOf(presets.STRK).catch(() => null),
          w.balanceOf(presets.ETH).catch(() => null),
        ]);

        if (cancelled) return;
        setStrk(strkBal ? strkBal.toFormatted() : null);
        setEth(ethBal ? ethBal.toFormatted() : null);
      } catch (err) {
        console.warn("[useStarkZapTokens] fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBalances();

    // Refresh every 30s
    const interval = setInterval(fetchBalances, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet]);

  return { strk, eth, loading };
}
