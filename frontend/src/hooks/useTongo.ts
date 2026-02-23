"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Account as TongoAccount, derivePublicKey } from "@fatsolutions/tongo-sdk";
import { RpcProvider } from "starknet";
import type { AccountInterface } from "starknet";
import {
  TONGO_STRK_ADDRESS,
  TONGO_STRK_RATE,
  TONGO_KEY_STORAGE_PREFIX,
} from "@/lib/constants";
import { RPC_URL } from "@/lib/dojo-config";

// ─── Tongo private key management ───
// We generate a random Tongo private key per wallet address and persist it
// in localStorage. This key is separate from the Starknet wallet key.

function getTongoStorageKey(walletAddress: string): string {
  return `${TONGO_KEY_STORAGE_PREFIX}:${walletAddress.toLowerCase()}`;
}

function loadOrCreateTongoKey(walletAddress: string): bigint {
  if (typeof window === "undefined") return 0n;

  const stored = localStorage.getItem(getTongoStorageKey(walletAddress));
  if (stored) {
    try {
      return BigInt(stored);
    } catch {
      // Corrupted — regenerate
    }
  }

  // Generate a random 252-bit private key (Stark curve order is ~252 bits)
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Ensure it's within the Stark curve order by masking top bits
  bytes[0] &= 0x0f; // Keep it under 2^252
  let pk = 0n;
  for (const b of bytes) {
    pk = (pk << 8n) | BigInt(b);
  }
  if (pk === 0n) pk = 1n; // Never zero

  localStorage.setItem(getTongoStorageKey(walletAddress), pk.toString());
  return pk;
}

// ─── Conversion helpers ───

/** Convert STRK amount (18 decimals) to Tongo units */
export function strkToTongo(strkWei: bigint): bigint {
  return strkWei / TONGO_STRK_RATE;
}

/** Convert Tongo units to STRK amount (18 decimals) */
export function tongoToStrk(tongoUnits: bigint): bigint {
  return tongoUnits * TONGO_STRK_RATE;
}

/** Format Tongo units as human-readable STRK (e.g. "5.00 STRK") */
export function formatTongoAsStrk(tongoUnits: bigint): string {
  const strkWei = tongoToStrk(tongoUnits);
  const whole = strkWei / 10n ** 18n;
  const frac = (strkWei % 10n ** 18n) / 10n ** 16n; // 2 decimal places
  return `${whole}.${frac.toString().padStart(2, "0")} STRK`;
}

// ─── Hook return type ───

export interface UseTongoReturn {
  /** Whether Tongo SDK is initialized and ready */
  isAvailable: boolean;
  /** Decrypted balance in Tongo units (null if not yet loaded) */
  balance: bigint | null;
  /** Pending balance awaiting rollover (Tongo units) */
  pending: bigint | null;
  /** Tongo public key for receiving transfers */
  publicKey: { x: bigint; y: bigint } | null;
  /** Tongo address (base58) */
  tongoAddress: string | null;
  /** Loading state for any operation */
  loading: boolean;
  /** Last error message */
  error: string | null;
  /** Wrap STRK into Tongo (amount in Tongo units) */
  fund: (tongoAmount: bigint) => Promise<void>;
  /** Unwrap Tongo back to STRK (amount in Tongo units, to wallet address) */
  withdraw: (tongoAmount: bigint, toAddress: string) => Promise<void>;
  /** Claim pending transfers into spendable balance */
  rollover: () => Promise<void>;
  /** Refresh balance from on-chain state */
  refreshBalance: () => Promise<void>;
}

export function useTongo(
  walletAddress: string | null,
  account: AccountInterface | null,
): UseTongoReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [pending, setPending] = useState<bigint | null>(null);
  const [publicKey, setPublicKey] = useState<{ x: bigint; y: bigint } | null>(null);
  const [tongoAddress, setTongoAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tongoRef = useRef<TongoAccount | null>(null);
  const providerRef = useRef<RpcProvider | null>(null);
  const initAddressRef = useRef<string>("");

  // Initialize Tongo account when wallet connects
  useEffect(() => {
    if (!walletAddress) {
      tongoRef.current = null;
      setIsAvailable(false);
      setBalance(null);
      setPending(null);
      setPublicKey(null);
      setTongoAddress(null);
      initAddressRef.current = "";
      return;
    }

    if (initAddressRef.current === walletAddress.toLowerCase()) return;
    initAddressRef.current = walletAddress.toLowerCase();

    try {
      const pk = loadOrCreateTongoKey(walletAddress);
      if (pk === 0n) return;

      if (!providerRef.current) {
        providerRef.current = new RpcProvider({ nodeUrl: RPC_URL });
      }

      // Cast to `any` because the app's starknet.js version may differ from the
      // SDK's bundled starknet.js, causing incompatible private-property types.
      // At runtime the RpcProvider implementations are compatible.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tongoAccount = new TongoAccount(
        pk,
        TONGO_STRK_ADDRESS,
        providerRef.current as any,
      );

      tongoRef.current = tongoAccount;
      const pubKey = derivePublicKey(pk);
      setPublicKey({ x: BigInt(pubKey.x), y: BigInt(pubKey.y) });
      setTongoAddress(tongoAccount.tongoAddress());
      setIsAvailable(true);
      setError(null);
    } catch (err) {
      console.error("Tongo initialization failed:", err);
      setError(err instanceof Error ? err.message : "Tongo init failed");
      setIsAvailable(false);
    }
  }, [walletAddress]);

  // Auto-fetch balance once initialized
  const refreshBalance = useCallback(async () => {
    const tongo = tongoRef.current;
    if (!tongo) return;

    try {
      const state = await tongo.state();
      setBalance(state.balance);
      setPending(state.pending);
    } catch (err) {
      // Account may not exist on-chain yet (never funded) — balance is 0
      console.warn("Tongo balance fetch:", err);
      setBalance(0n);
      setPending(0n);
    }
  }, []);

  useEffect(() => {
    if (isAvailable) {
      refreshBalance();
    }
  }, [isAvailable, refreshBalance]);

  // Fund: wrap STRK → Tongo
  const fund = useCallback(
    async (tongoAmount: bigint) => {
      const tongo = tongoRef.current;
      if (!tongo || !account || !walletAddress) {
        setError("Wallet not connected");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const op = await tongo.fund({
          amount: tongoAmount,
          sender: walletAddress,
        });

        // Execute: ERC20 approval + fund in one multicall
        const calls = op.approve ? [op.approve, op.toCalldata()] : [op.toCalldata()];
        const tx = await account.execute(calls);

        // Wait for tx confirmation
        if (providerRef.current && tx?.transaction_hash) {
          await providerRef.current.waitForTransaction(tx.transaction_hash);
        }

        await refreshBalance();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Fund failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [account, walletAddress, refreshBalance],
  );

  // Withdraw: Tongo → STRK
  const withdraw = useCallback(
    async (tongoAmount: bigint, toAddress: string) => {
      const tongo = tongoRef.current;
      if (!tongo || !account || !walletAddress) {
        setError("Wallet not connected");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const op = await tongo.withdraw({
          amount: tongoAmount,
          to: toAddress,
          sender: walletAddress,
        });

        const tx = await account.execute([op.toCalldata()]);

        if (providerRef.current && tx?.transaction_hash) {
          await providerRef.current.waitForTransaction(tx.transaction_hash);
        }

        await refreshBalance();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Withdraw failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [account, walletAddress, refreshBalance],
  );

  // Rollover: move pending → balance
  const rollover = useCallback(async () => {
    const tongo = tongoRef.current;
    if (!tongo || !account || !walletAddress) {
      setError("Wallet not connected");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const op = await tongo.rollover({
        sender: walletAddress,
      });

      const tx = await account.execute([op.toCalldata()]);

      if (providerRef.current && tx?.transaction_hash) {
        await providerRef.current.waitForTransaction(tx.transaction_hash);
      }

      await refreshBalance();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Rollover failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, walletAddress, refreshBalance]);

  return {
    isAvailable,
    balance,
    pending,
    publicKey,
    tongoAddress,
    loading,
    error,
    fund,
    withdraw,
    rollover,
    refreshBalance,
  };
}
