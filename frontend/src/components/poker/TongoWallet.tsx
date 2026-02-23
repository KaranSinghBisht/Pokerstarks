"use client";

import { useState } from "react";
import type { UseTongoReturn } from "@/hooks/useTongo";
import { formatTongoAsStrk, strkToTongo, snapToTongoStep } from "@/hooks/useTongo";

interface TongoWalletProps {
  tongo: UseTongoReturn;
  walletAddress: string;
}

export default function TongoWallet({ tongo, walletAddress }: TongoWalletProps) {
  const [mode, setMode] = useState<"idle" | "fund" | "withdraw" | "export" | "import">("idle");
  const [amount, setAmount] = useState("");
  const [importKey, setImportKey] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [localInfo, setLocalInfo] = useState<string | null>(null);

  /** Convert STRK input to Tongo units with snap-to-step validation (P2 fix) */
  const parseAndSnap = (raw: string): { tongoUnits: bigint; snapped: number } | null => {
    const strkAmount = parseFloat(raw);
    if (isNaN(strkAmount) || strkAmount <= 0) {
      setLocalError("Enter a valid STRK amount");
      return null;
    }
    const snapped = snapToTongoStep(strkAmount);
    if (snapped <= 0) {
      setLocalError("Amount too small (min 0.05 STRK)");
      return null;
    }
    const strkWei = BigInt(Math.round(snapped * 1e18));
    const tongoUnits = strkToTongo(strkWei);
    if (tongoUnits <= 0n) {
      setLocalError("Amount too small (min 0.05 STRK)");
      return null;
    }
    // Warn if snapped differs from input
    if (Math.abs(snapped - strkAmount) > 0.001) {
      setLocalInfo(`Rounded to ${snapped.toFixed(2)} STRK (Tongo step: 0.05)`);
    } else {
      setLocalInfo(null);
    }
    return { tongoUnits, snapped };
  };

  const handleFund = async () => {
    setLocalError(null);
    setLocalInfo(null);
    const result = parseAndSnap(amount);
    if (!result) return;
    try {
      await tongo.fund(result.tongoUnits);
      setAmount("");
      setMode("idle");
      setLocalInfo(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Fund failed");
    }
  };

  const handleWithdraw = async () => {
    setLocalError(null);
    setLocalInfo(null);
    const result = parseAndSnap(amount);
    if (!result) return;
    if (tongo.balance !== null && result.tongoUnits > tongo.balance) {
      setLocalError("Insufficient Tongo balance");
      return;
    }
    try {
      await tongo.withdraw(result.tongoUnits, walletAddress);
      setAmount("");
      setMode("idle");
      setLocalInfo(null);
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

  const handleExportKey = () => {
    setLocalError(null);
    setLocalInfo(null);
    const key = tongo.exportKey();
    if (key) {
      setLocalInfo(key);
      setMode("export");
    } else {
      setLocalError("No key to export");
    }
  };

  const handleImportKey = () => {
    setLocalError(null);
    setLocalInfo(null);
    if (!importKey.trim()) {
      setLocalError("Paste a hex private key");
      return;
    }
    const ok = tongo.importKey(importKey.trim());
    if (ok) {
      setImportKey("");
      setMode("idle");
      setLocalInfo("Key imported — wallet reinitializing...");
    } else {
      setLocalError("Invalid key format");
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
  const isBalanceError = tongo.balanceStatus === "error";

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
          {tongo.balanceStatus === "loading" ? (
            <span className="font-retro-display text-[10px] text-slate-500">...</span>
          ) : isBalanceError ? (
            <span className="font-retro-display text-[9px] text-red-400">
              {tongo.balance !== null ? `${formatTongoAsStrk(tongo.balance)} (stale)` : "ERROR"}
            </span>
          ) : (
            <span className="font-retro-display text-[10px] text-[var(--accent)]">
              {tongo.balance !== null ? formatTongoAsStrk(tongo.balance) : "..."}
            </span>
          )}
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
        <>
          <div className="flex gap-2">
            <button
              onClick={() => { setMode("fund"); setLocalError(null); setLocalInfo(null); setAmount(""); }}
              className="flex-1 py-2 font-retro-display text-[9px] brand-btn-cyan"
            >
              DEPOSIT
            </button>
            <button
              onClick={() => { setMode("withdraw"); setLocalError(null); setLocalInfo(null); setAmount(""); }}
              disabled={!tongo.balance || tongo.balance === 0n}
              className="flex-1 py-2 font-retro-display text-[9px] brand-btn-magenta disabled:opacity-40"
            >
              WITHDRAW
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportKey}
              className="flex-1 py-1 font-retro-display text-[7px] text-slate-500 hover:text-[var(--secondary)]"
            >
              BACKUP KEY
            </button>
            <button
              onClick={() => { setMode("import"); setLocalError(null); setLocalInfo(null); setImportKey(""); }}
              className="flex-1 py-1 font-retro-display text-[7px] text-slate-500 hover:text-[var(--secondary)]"
            >
              IMPORT KEY
            </button>
          </div>
        </>
      )}

      {/* Fund/Withdraw form */}
      {(mode === "fund" || mode === "withdraw") && (
        <div className="flex flex-col gap-2">
          <label className="font-retro-display text-[8px] text-slate-400">
            {mode === "fund" ? "DEPOSIT STRK \u2192 TONGO" : "WITHDRAW TONGO \u2192 STRK"}
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.05"
              min="0.05"
              placeholder="STRK amount (step: 0.05)"
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
              onClick={() => { setMode("idle"); setLocalError(null); setLocalInfo(null); }}
              className="px-2 py-2 font-retro-display text-[8px] text-slate-400 hover:text-white"
            >
              X
            </button>
          </div>
        </div>
      )}

      {/* Export key display */}
      {mode === "export" && localInfo && (
        <div className="flex flex-col gap-2">
          <label className="font-retro-display text-[8px] text-red-300">
            PRIVATE KEY — SAVE THIS SECURELY
          </label>
          <input
            type="text"
            readOnly
            value={localInfo}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="border-2 border-red-800 bg-slate-900 px-2 py-2 font-retro-display text-[9px] text-red-300 outline-none"
          />
          <button
            onClick={() => { setMode("idle"); setLocalInfo(null); }}
            className="py-1 font-retro-display text-[8px] text-slate-400 hover:text-white"
          >
            DONE
          </button>
        </div>
      )}

      {/* Import key form */}
      {mode === "import" && (
        <div className="flex flex-col gap-2">
          <label className="font-retro-display text-[8px] text-slate-400">
            PASTE TONGO PRIVATE KEY (0x...)
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="0x..."
              value={importKey}
              onChange={(e) => setImportKey(e.target.value)}
              className="flex-1 border-2 border-black bg-slate-900 px-2 py-2 font-retro-display text-[10px] text-white outline-none focus:border-[var(--primary)]"
            />
            <button
              onClick={handleImportKey}
              disabled={!importKey.trim()}
              className="px-3 py-2 font-retro-display text-[8px] brand-btn-cyan disabled:opacity-50"
            >
              GO
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

      {/* Info message (snap warning, import success, etc.) */}
      {localInfo && mode !== "export" && (
        <div className="font-retro-display text-[7px] text-yellow-400">
          {localInfo}
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
