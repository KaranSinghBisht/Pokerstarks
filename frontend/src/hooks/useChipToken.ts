"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { RpcProvider, CallData } from "starknet";
import type { AccountInterface } from "starknet";
import { CHIP_TOKEN_ADDRESS } from "@/lib/constants";
import { RPC_URL } from "@/lib/dojo-config";

export interface UseChipTokenReturn {
  /** CHIP balance (null if not yet loaded) */
  balance: bigint | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch balance from chain */
  refreshBalance: () => Promise<void>;
  /** Claim welcome bonus from faucet (10k CHIP) */
  claimFaucet: () => Promise<void>;
  /** Approve the lobby contract to spend `amount` CHIP on our behalf */
  approveForTable: (spender: string, amount: bigint) => Promise<void>;
  /** Whether a CHIP token address is configured */
  isConfigured: boolean;
  /** Whether a faucet claim is in-flight */
  claiming: boolean;
}

export function useChipToken(
  address: string | null,
  account: AccountInterface | null,
): UseChipTokenReturn {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<RpcProvider | null>(null);

  const isConfigured = !!CHIP_TOKEN_ADDRESS;

  function getProvider(): RpcProvider {
    if (!providerRef.current) {
      providerRef.current = new RpcProvider({ nodeUrl: RPC_URL });
    }
    return providerRef.current;
  }

  const refreshBalance = useCallback(async () => {
    if (!address || !CHIP_TOKEN_ADDRESS) {
      setBalance(null);
      return;
    }

    setLoading(true);
    try {
      const provider = getProvider();
      const result = await provider.callContract({
        contractAddress: CHIP_TOKEN_ADDRESS,
        entrypoint: "balance_of",
        calldata: CallData.compile([address]),
      });
      // ERC20 balanceOf returns u256 (low, high)
      const low = BigInt(result[0] ?? "0");
      const high = BigInt(result[1] ?? "0");
      setBalance(low + (high << 128n));
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If contract not found, balance is 0
      if (
        msg.includes("Contract not found") ||
        msg.includes("ContractNotFound") ||
        msg.includes("is not deployed")
      ) {
        setBalance(0n);
        setError(null);
      } else {
        console.warn("CHIP balance fetch error:", err);
        setError("Failed to fetch CHIP balance");
      }
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Auto-fetch on address change
  useEffect(() => {
    if (address && CHIP_TOKEN_ADDRESS) {
      refreshBalance();
    } else {
      setBalance(null);
    }
  }, [address, refreshBalance]);

  const claimFaucet = useCallback(async () => {
    if (!address) {
      setError("Connect wallet first");
      return;
    }
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch("/api/chip/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Faucet claim failed");
        return;
      }
      // Refresh balance after successful claim
      // Small delay for chain confirmation
      await new Promise((r) => setTimeout(r, 3000));
      await refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Faucet request failed");
    } finally {
      setClaiming(false);
    }
  }, [address, refreshBalance]);

  const approveForTable = useCallback(
    async (spender: string, amount: bigint) => {
      if (!account || !CHIP_TOKEN_ADDRESS) {
        throw new Error("Wallet not connected or CHIP token not configured");
      }
      await account.execute({
        contractAddress: CHIP_TOKEN_ADDRESS,
        entrypoint: "approve",
        calldata: CallData.compile([spender, amount, 0]), // u256 = (low, high)
      });
    },
    [account],
  );

  return {
    balance,
    loading,
    error,
    refreshBalance,
    claimFaucet,
    approveForTable,
    isConfigured,
    claiming,
  };
}
