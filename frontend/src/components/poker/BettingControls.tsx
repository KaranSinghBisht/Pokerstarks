"use client";

import { useState } from "react";
import { PlayerAction } from "@/lib/constants";

interface BettingControlsProps {
  currentBet: bigint;
  playerBet: bigint;
  playerChips: bigint;
  bigBlind: bigint;
  isPlayerTurn: boolean;
  onAction: (action: PlayerAction, amount: bigint) => void;
}

export default function BettingControls({
  currentBet,
  playerBet,
  playerChips,
  bigBlind,
  isPlayerTurn,
  onAction,
}: BettingControlsProps) {
  const [betAmount, setBetAmount] = useState<string>("");

  const callAmount = currentBet - playerBet;
  const canCheck = callAmount === 0n;
  const canCall = callAmount > 0n && playerChips >= callAmount;
  const minRaise = currentBet > 0n ? currentBet * 2n : bigBlind;
  const canBet = playerChips > callAmount;
  const sliderValue = (() => {
    const raw = Number(betAmount || "0");
    if (!raw) return 0;
    const cap = Number(playerChips || 1n);
    return Math.max(0, Math.min(100, Math.round((raw / cap) * 100)));
  })();

  const commitBet = () => {
    try {
      const raw = betAmount.replace(/[^0-9]/g, "");
      const amt = BigInt(raw || "0");
      if (amt >= minRaise) {
        onAction(currentBet > 0n ? PlayerAction.Raise : PlayerAction.Bet, amt);
        setBetAmount("");
      }
    } catch {
      // ignore invalid bet input
    }
  };

  if (!isPlayerTurn) {
    return (
      <div className="mx-4 bg-black/80 p-4 pixel-border border-black">
        <span className="font-retro-display text-[9px] text-slate-400">
          WAITING FOR OPPONENT...
        </span>
      </div>
    );
  }

  return (
    <div className="mx-2 border-t-4 border-black bg-black/80 p-3 md:mx-6 md:p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => onAction(PlayerAction.Fold, 0n)}
            className="h-14 w-24 border-b-8 border-red-900 bg-red-600 font-retro-display text-[10px] text-white pixel-button-shadow transition-all hover:translate-y-0.5 active:translate-y-1 active:border-b-4"
          >
            FOLD
          </button>

          {canCheck ? (
            <button
              onClick={() => onAction(PlayerAction.Check, 0n)}
              className="h-14 w-24 border-b-8 border-blue-900 bg-blue-600 font-retro-display text-[9px] text-white pixel-button-shadow transition-all hover:translate-y-0.5 active:translate-y-1 active:border-b-4"
            >
              CHECK
            </button>
          ) : canCall ? (
            <button
              onClick={() => onAction(PlayerAction.Call, callAmount)}
              className="h-14 w-24 border-b-8 border-blue-900 bg-blue-600 px-1 font-retro-display text-[8px] text-white pixel-button-shadow transition-all hover:translate-y-0.5 active:translate-y-1 active:border-b-4"
            >
              <div>CHECK/CALL</div>
              <div className="mt-1 text-[7px] text-blue-100">{Number(callAmount)}</div>
            </button>
          ) : (
            <button
              disabled
              className="h-14 w-24 border-b-8 border-slate-800 bg-slate-700 font-retro-display text-[9px] text-slate-400"
            >
              CALL
            </button>
          )}

          <button
            onClick={() => onAction(PlayerAction.AllIn, playerChips)}
            className="h-14 w-24 border-b-8 border-green-900 bg-green-600 font-retro-display text-[10px] text-white pixel-button-shadow transition-all hover:translate-y-0.5 active:translate-y-1 active:border-b-4"
          >
            RAISE
          </button>
        </div>

        <div className="min-w-[220px] flex-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-retro-display text-[8px] text-slate-400">BET AMOUNT</span>
            <span className="font-retro-display text-[10px] text-[var(--accent)]">
              {betAmount || Number(minRaise)}
            </span>
          </div>
          <div className="relative h-6 bg-slate-900 pixel-border-sm">
            <div
              className="absolute bottom-0 left-0 top-0 bg-[var(--primary)]/40"
              style={{ width: `${sliderValue}%` }}
            />
            <input
              type="range"
              min={Number(minRaise)}
              max={Number(playerChips)}
              value={Math.max(Number(minRaise), Number(betAmount || minRaise))}
              onChange={(e) => setBetAmount(e.target.value)}
              className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent opacity-0"
            />
            <div
              className="pointer-events-none absolute -top-1 h-8 w-4 bg-white pixel-border-sm"
              style={{ left: `${sliderValue}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setBetAmount(String(Math.max(1, Number(currentBet / 2n))))}
            className="bg-slate-700 px-3 py-2 font-retro-display text-[8px] text-white pixel-border-sm transition-colors hover:bg-slate-600"
          >
            1/2 POT
          </button>
          <button
            onClick={() => setBetAmount(String(Number(currentBet || bigBlind)))}
            className="bg-slate-700 px-3 py-2 font-retro-display text-[8px] text-white pixel-border-sm transition-colors hover:bg-slate-600"
          >
            POT
          </button>
          <button
            onClick={() => onAction(PlayerAction.AllIn, playerChips)}
            className="bg-[var(--primary)] px-3 py-2 font-retro-display text-[8px] text-black pixel-border-sm transition-colors hover:brightness-110"
          >
            ALL-IN
          </button>
          {canBet && (
            <button
              onClick={commitBet}
              className="bg-[var(--secondary)] px-3 py-2 font-retro-display text-[8px] text-black pixel-border-sm transition-colors hover:brightness-110"
            >
              CONFIRM
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

