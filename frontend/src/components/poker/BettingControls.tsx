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

  if (!isPlayerTurn) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="text-gray-400 text-sm">Waiting for opponent...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-gray-800/80 rounded-xl border border-gray-700">
      <div className="flex gap-2">
        {/* Fold */}
        <button
          onClick={() => onAction(PlayerAction.Fold, 0n)}
          className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors"
        >
          Fold
        </button>

        {/* Check / Call */}
        {canCheck ? (
          <button
            onClick={() => onAction(PlayerAction.Check, 0n)}
            className="flex-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-colors"
          >
            Check
          </button>
        ) : canCall ? (
          <button
            onClick={() => onAction(PlayerAction.Call, callAmount)}
            className="flex-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-colors"
          >
            Call {Number(callAmount)}
          </button>
        ) : null}

        {/* All-In */}
        <button
          onClick={() => onAction(PlayerAction.AllIn, playerChips)}
          className="flex-1 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors"
        >
          All-In
        </button>
      </div>

      {/* Bet / Raise */}
      {canBet && (
        <div className="flex gap-2">
          <input
            type="number"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder={`Min: ${Number(minRaise)}`}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-400 text-sm"
          />
          <button
            onClick={() => {
              try {
                const raw = betAmount.replace(/[^0-9]/g, "");
                const amt = BigInt(raw || "0");
                if (amt >= minRaise) {
                  onAction(
                    currentBet > 0n ? PlayerAction.Raise : PlayerAction.Bet,
                    amt,
                  );
                  setBetAmount("");
                }
              } catch {
                // Invalid input — ignore (e.g. empty string, decimals)
              }
            }}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors"
          >
            {currentBet > 0n ? "Raise" : "Bet"}
          </button>
        </div>
      )}
    </div>
  );
}
