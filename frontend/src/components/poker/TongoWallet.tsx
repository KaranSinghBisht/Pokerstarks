"use client";

import { useState } from "react";
import type { UseTongoReturn } from "@/hooks/useTongo";
import { formatTongoAsStrk, strkToTongo } from "@/hooks/useTongo";

interface TongoWalletProps {
  tongo: UseTongoReturn;
  walletAddress: string;
}

export default function TongoWallet({ tongo, walletAddress }: TongoWalletProps) {
  const [mode, setMode] = useState<"idle" | "fund" | "withdraw">("idle");
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFund = async () => {
    setLocalError(null);
    const strkAmount = parseFloat(amount);
    if (isNaN(strkAmount) || strkAmount <= 0) {
      setLocalError("Enter a valid STRK amount");
      return;
    }
    try {
      // Convert human STRK to Tongo units: STRK * 1e18 / rate
      const strkWei = BigInt(Math.floor(strkAmount * 1e18));
      const tongoUnits = strkToTongo(strkWei);
      if (tongoUnits <= 0n) {
        setLocalError("Amount too small (min 0.05 STRK)");
        return;
      }
      await tongo.fund(tongoUnits);
      setAmount("");
      setMode("idle");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Fund failed");
    }
  };

  const handleWithdraw = async () => {
    setLocalError(null);
    const strkAmount = parseFloat(amount);
    if (isNaN(strkAmount) || strkAmount <= 0) {
      setLocalError("Enter a valid STRK amount");
      return;
    }
    try {
      const strkWei = BigInt(Math.floor(strkAmount * 1e18));
      const tongoUnits = strkToTongo(strkWei);
      if (tongoUnits <= 0n) {
        setLocalError("Amount too small");
        return;
      }
      if (tongo.balance !== null && tongoUnits > tongo.balance) {
        setLocalError("Insufficient Tongo balance");
        return;
      }
      await tongo.withdraw(tongoUnits, walletAddress);
      setAmount("");
      setMode("idle");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Withdraw failed");
    }
  };

  const handleRollover = async () => {
    setLocalError(null);
    try {
      await tongo.rollover();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Rollover failed");
    }
  };

  if (!tongo.isAvailable) {
    return (
      <div className="flex flex-col gap-2 border-t-2 border-black bg-black/10 p-4">
        <span className="font-retro-display text-[10px] text-slate-500">
          TONGO WALLET
        </span>
        <span className="font-retro-display text-[8px] text-slate-600">
          Connect wallet to enable confidential balance
        </span>
      </div>
    );
  }

  const activeError = localError || tongo.error;

  return (
    <div className="flex flex-col gap-3 border-t-2 border-black bg-black/10 p-4">
      <div className="flex items-center justify-between">
        <span className="font-retro-display text-[10px] text-slate-300">
          TONGO WALLET
        </span>
        <button
          onClick={() => tongo.refreshBalance()}
          className="font-retro-display text-[7px] text-[var(--secondary)] hover:text-white"
          title="Refresh balance"
        >
          REFRESH
        </button>
      </div>

      {/* Balance display */}
      <div className="bg-black/60 px-3 py-2 pixel-border-sm">
        <div className="flex items-center justify-between">
          <span className="font-retro-display text-[8px] text-slate-400">BALANCE</span>
          <span className="font-retro-display text-[10px] text-[var(--accent)]">
            {tongo.balance !== null ? formatTongoAsStrk(tongo.balance) : "..."}
          </span>
        </div>
        {tongo.pending !== null && tongo.pending > 0n && (
          <div className="mt-1 flex items-center justify-between">
            <span className="font-retro-display text-[8px] text-slate-500">PENDING</span>
            <div className="flex items-center gap-2">
              <span className="font-retro-display text-[9px] text-yellow-400">
                {formatTongoAsStrk(tongo.pending)}
              </span>
              <button
                onClick={handleRollover}
                disabled={tongo.loading}
                className="font-retro-display text-[7px] text-[var(--primary)] hover:text-white disabled:opacity-50"
              >
                CLAIM
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tongo address */}
      {tongo.tongoAddress && (
        <div className="flex items-center gap-1">
          <span className="font-retro-display text-[7px] text-slate-600">TONGO ID:</span>
          <span
            className="max-w-[140px] truncate font-retro-display text-[7px] text-slate-500"
            title={tongo.tongoAddress}
          >
            {tongo.tongoAddress}
          </span>
        </div>
      )}

      {/* Action buttons */}
      {mode === "idle" && (
        <div className="flex gap-2">
          <button
            onClick={() => { setMode("fund"); setLocalError(null); setAmount(""); }}
            className="flex-1 py-2 font-retro-display text-[9px] brand-btn-cyan"
          >
            DEPOSIT
          </button>
          <button
            onClick={() => { setMode("withdraw"); setLocalError(null); setAmount(""); }}
            disabled={!tongo.balance || tongo.balance === 0n}
            className="flex-1 py-2 font-retro-display text-[9px] brand-btn-magenta disabled:opacity-40"
          >
            WITHDRAW
          </button>
        </div>
      )}

      {/* Fund/Withdraw form */}
      {mode !== "idle" && (
        <div className="flex flex-col gap-2">
          <label className="font-retro-display text-[8px] text-slate-400">
            {mode === "fund" ? "DEPOSIT STRK → TONGO" : "WITHDRAW TONGO → STRK"}
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.05"
              min="0.05"
              placeholder="STRK amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 border-2 border-black bg-slate-900 px-2 py-2 font-retro-display text-[10px] text-white outline-none focus:border-[var(--primary)]"
            />
            <button
              onClick={mode === "fund" ? handleFund : handleWithdraw}
              disabled={tongo.loading || !amount}
              className="px-3 py-2 font-retro-display text-[8px] brand-btn-cyan disabled:opacity-50"
            >
              {tongo.loading ? "..." : "GO"}
            </button>
            <button
              onClick={() => { setMode("idle"); setLocalError(null); }}
              className="px-2 py-2 font-retro-display text-[8px] text-slate-400 hover:text-white"
            >
              X
            </button>
          </div>
        </div>
      )}

      {activeError && (
        <div className="font-retro-display text-[7px] text-red-400">
          {activeError}
        </div>
      )}
    </div>
  );
}
