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
// Private key is generated once per wallet address and persisted in localStorage.
// Users can export/import the key to recover across devices/browsers.

function getTongoStorageKey(walletAddress: string): string {
  return `${TONGO_KEY_STORAGE_PREFIX}:${walletAddress.toLowerCase()}`;
}

function loadTongoKey(walletAddress: string): bigint | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(getTongoStorageKey(walletAddress));
  if (!stored) return null;
  try {
    const pk = BigInt(stored);
    return pk > 0n ? pk : null;
  } catch {
    return null;
  }
}

function generateTongoKey(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  bytes[0] &= 0x0f; // Keep under 2^252 (Stark curve order)
  let pk = 0n;
  for (const b of bytes) {
    pk = (pk << 8n) | BigInt(b);
  }
  return pk === 0n ? 1n : pk;
}

function saveTongoKey(walletAddress: string, pk: bigint): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getTongoStorageKey(walletAddress), pk.toString());
}

/** Export the Tongo private key as a hex string for backup */
export function exportTongoKey(walletAddress: string): string | null {
  const pk = loadTongoKey(walletAddress);
  if (!pk) return null;
  return "0x" + pk.toString(16);
}

/** Import a Tongo private key from a hex string (backup recovery) */
export function importTongoKey(walletAddress: string, hexKey: string): boolean {
  try {
    const pk = BigInt(hexKey);
    if (pk <= 0n) return false;
    saveTongoKey(walletAddress, pk);
    return true;
  } catch {
    return false;
  }
}

// ─── Conversion helpers ───

/** Snap a human STRK amount to the nearest valid Tongo unit boundary */
export function snapToTongoStep(strkAmount: number): number {
  const strkPerUnit = Number(TONGO_STRK_RATE) / 1e18; // 0.05
  return Math.round(strkAmount / strkPerUnit) * strkPerUnit;
}

/** Convert STRK amount (18 decimals) to Tongo units (rounds down) */
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

// ─── Balance fetch status ───

type BalanceStatus = "idle" | "loading" | "ok" | "error";

// ─── Hook return type ───

export interface UseTongoReturn {
  isAvailable: boolean;
  /** Decrypted balance in Tongo units (null if not yet loaded) */
  balance: bigint | null;
  /** Pending balance awaiting rollover (Tongo units) */
  pending: bigint | null;
  /** Whether the balance fetch is in an error state (vs genuinely zero) */
  balanceStatus: BalanceStatus;
  publicKey: { x: bigint; y: bigint } | null;
  tongoAddress: string | null;
  loading: boolean;
  error: string | null;
  fund: (tongoAmount: bigint) => Promise<void>;
  withdraw: (tongoAmount: bigint, toAddress: string) => Promise<void>;
  rollover: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  /** Export private key as hex for backup */
  exportKey: () => string | null;
  /** Import private key from hex backup; returns true on success */
  importKey: (hexKey: string) => boolean;
}

export function useTongo(
  walletAddress: string | null,
  account: AccountInterface | null,
): UseTongoReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [pending, setPending] = useState<bigint | null>(null);
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>("idle");
  const [publicKey, setPublicKey] = useState<{ x: bigint; y: bigint } | null>(null);
  const [tongoAddress, setTongoAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tongoRef = useRef<TongoAccount | null>(null);
  const providerRef = useRef<RpcProvider | null>(null);
  const initAddressRef = useRef<string>("");
  // Monotonic counter to cancel stale balance fetches (P3 fix)
  const balanceGenRef = useRef(0);
  // Bumped to force re-init on same address (e.g. after key import)
  const [reinitCounter, setReinitCounter] = useState(0);
  const prevReinitRef = useRef(0);

  // Initialize Tongo account when wallet connects (or reinitCounter bumps)
  useEffect(() => {
    if (!walletAddress) {
      tongoRef.current = null;
      setIsAvailable(false);
      setBalance(null);
      setPending(null);
      setBalanceStatus("idle");
      setPublicKey(null);
      setTongoAddress(null);
      setError(null);
      initAddressRef.current = "";
      balanceGenRef.current++;
      return;
    }

    const normalAddr = walletAddress.toLowerCase();
    const isReinit = reinitCounter !== prevReinitRef.current;
    // Skip if address matches AND no forced reinit was requested
    if (initAddressRef.current === normalAddr && !isReinit) return;
    prevReinitRef.current = reinitCounter;

    // Clear stale state before (re-)init
    setBalance(null);
    setPending(null);
    setBalanceStatus("idle");
    setError(null);
    balanceGenRef.current++;

    initAddressRef.current = normalAddr;

    try {
      let pk = loadTongoKey(walletAddress);
      if (!pk) {
        pk = generateTongoKey();
        saveTongoKey(walletAddress, pk);
      }

      if (!providerRef.current) {
        providerRef.current = new RpcProvider({ nodeUrl: RPC_URL });
      }

      // P3 fix: validate that the provider's chain matches Sepolia (SN_SEPOLIA = 0x534e5f5345504f4c4941).
      // If the wallet is on a different chain, Tongo proofs will fail silently.
      providerRef.current.getChainId().then((chainId) => {
        const sepoliaId = "0x534e5f5345504f4c4941";
        const mainnetId = "0x534e5f4d41494e";
        // Tongo STRK address is for Sepolia; warn if chain doesn't match
        if (
          TONGO_STRK_ADDRESS.toLowerCase() ===
            "0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed" &&
          chainId !== sepoliaId
        ) {
          setError("Chain mismatch: Tongo contract is Sepolia but RPC is on a different network");
        } else if (
          TONGO_STRK_ADDRESS.toLowerCase() ===
            "0x3a542d7eb73b3e33a2c54e9827ec17a6365e289ec35ccc94dde97950d9db498" &&
          chainId !== mainnetId
        ) {
          setError("Chain mismatch: Tongo contract is Mainnet but RPC is on a different network");
        }
      }).catch(() => {
        // Non-fatal: chain check is best-effort
      });

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
  }, [walletAddress, reinitCounter]);

  // Auto-fetch balance once initialized
  const refreshBalance = useCallback(async () => {
    const tongo = tongoRef.current;
    if (!tongo) return;

    const gen = ++balanceGenRef.current;
    setBalanceStatus("loading");

    try {
      const state = await tongo.state();
      // Stale guard: discard if a newer fetch/wallet-switch happened (P3 fix)
      if (balanceGenRef.current !== gen) return;
      setBalance(state.balance);
      setPending(state.pending);
      setBalanceStatus("ok");
    } catch (err) {
      if (balanceGenRef.current !== gen) return;

      // P2 fix: Distinguish "account not found" (genuinely 0) from RPC errors.
      // Tongo contract returns empty state for never-funded accounts, which the
      // SDK surfaces as a specific error. True RPC/network errors are different.
      const msg = err instanceof Error ? err.message : String(err);
      const isAccountNotFound =
        msg.includes("StarknetErrorCode.UNINITIALIZED_CONTRACT") ||
        msg.includes("is not deployed") ||
        msg.includes("Contract not found") ||
        msg.includes("ContractNotFound") ||
        /Entry point .* not found in contract/.test(msg);

      if (isAccountNotFound) {
        setBalance(0n);
        setPending(0n);
        setBalanceStatus("ok");
      } else {
        console.warn("Tongo balance fetch error:", err);
        // Keep previous balance visible, surface error
        setBalanceStatus("error");
        setError("Balance fetch failed — values may be stale");
      }
    }
  }, []);

  useEffect(() => {
    if (isAvailable) {
      refreshBalance();
    }
  }, [isAvailable, refreshBalance]);

  // ─── Transaction executor with safe waitForTransaction ───
  // P2 fix: if account.execute succeeds but waitForTransaction fails, the tx
  // was likely already accepted. We refresh balance and show a warning instead
  // of treating it as a full failure that invites retry.
  const execAndWait = useCallback(
    async (
      calls: Parameters<AccountInterface["execute"]>[0],
      label: string,
    ): Promise<void> => {
      const tx = await account!.execute(calls);

      if (providerRef.current && tx?.transaction_hash) {
        try {
          await providerRef.current.waitForTransaction(tx.transaction_hash);
        } catch (waitErr) {
          console.warn(`${label}: waitForTransaction failed, tx may still land:`, waitErr);
          // Refresh balance to show real state instead of throwing
          await refreshBalance();
          setError(`${label} submitted (tx ${tx.transaction_hash.slice(0, 10)}...) but confirmation timed out. Balance refreshed.`);
          return; // Do NOT throw — tx is likely accepted
        }
      }

      await refreshBalance();
    },
    [account, refreshBalance],
  );

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

        const calls = op.approve ? [op.approve, op.toCalldata()] : [op.toCalldata()];
        await execAndWait(calls, "Fund");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Fund failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [account, walletAddress, execAndWait],
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

        await execAndWait([op.toCalldata()], "Withdraw");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Withdraw failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [account, walletAddress, execAndWait],
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

      await execAndWait([op.toCalldata()], "Rollover");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Rollover failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, walletAddress, execAndWait]);

  // P1 fix: key export/import for backup & recovery
  const exportKeyFn = useCallback((): string | null => {
    if (!walletAddress) return null;
    return exportTongoKey(walletAddress);
  }, [walletAddress]);

  const importKeyFn = useCallback(
    (hexKey: string): boolean => {
      if (!walletAddress) return false;
      const ok = importTongoKey(walletAddress, hexKey);
      if (ok) {
        // Force re-init by bumping reinitCounter (effect depends on it)
        initAddressRef.current = "";
        balanceGenRef.current++;
        setReinitCounter((c) => c + 1);
      }
      return ok;
    },
    [walletAddress],
  );

  return {
    isAvailable,
    balance,
    pending,
    balanceStatus,
    publicKey,
    tongoAddress,
    loading,
    error,
    fund,
    withdraw,
    rollover,
    refreshBalance,
    exportKey: exportKeyFn,
    importKey: importKeyFn,
  };
}
