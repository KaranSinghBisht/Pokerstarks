"use client";

import Card from "./Card";
import type { SeatData, PlayerHandData } from "@/lib/types";

interface PlayerSeatProps {
  seat: SeatData;
  playerHand?: PlayerHandData;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isLocalPlayer: boolean;
  position: { top: string; left: string };
}

export default function PlayerSeat({
  seat,
  playerHand,
  isCurrentTurn,
  isDealer,
  isLocalPlayer,
  position,
}: PlayerSeatProps) {
  if (!seat.isOccupied) {
    return (
      <div
        className="absolute flex flex-col items-center gap-1"
        style={{ top: position.top, left: position.left, transform: "translate(-50%, -50%)" }}
      >
        <div className="w-20 h-20 rounded-full border-2 border-dashed border-gray-600 bg-gray-800/50 flex items-center justify-center">
          <span className="text-gray-500 text-xs">Empty</span>
        </div>
      </div>
    );
  }

  const shortAddr = seat.player.slice(0, 6) + "..." + seat.player.slice(-4);
  const chips = Number(seat.chips);

  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={{ top: position.top, left: position.left, transform: "translate(-50%, -50%)" }}
    >
      {/* Dealer button */}
      {isDealer && (
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-yellow-400 text-black text-xs font-bold flex items-center justify-center z-10">
          D
        </div>
      )}

      {/* Player avatar/info */}
      <div
        className={`w-20 h-20 rounded-full border-2 flex flex-col items-center justify-center transition-all ${
          isCurrentTurn
            ? "border-yellow-400 bg-gray-700 ring-2 ring-yellow-400/50"
            : playerHand?.hasFolded
              ? "border-gray-700 bg-gray-800/70 opacity-50"
              : "border-gray-600 bg-gray-800"
        }`}
      >
        <span className="text-xs text-gray-300 truncate w-16 text-center">
          {isLocalPlayer ? "You" : shortAddr}
        </span>
        <span className="text-sm font-bold text-amber-400">{chips}</span>
      </div>

      {/* Cards */}
      {playerHand && !playerHand.hasFolded && (
        <div className="flex gap-0.5 -mt-1">
          <Card
            cardId={isLocalPlayer ? playerHand.holeCard1Id : 255}
            small
          />
          <Card
            cardId={isLocalPlayer ? playerHand.holeCard2Id : 255}
            small
          />
        </div>
      )}

      {/* Bet indicator */}
      {playerHand && playerHand.betThisRound > 0n && (
        <div className="text-xs text-gray-300 bg-gray-700/80 px-2 py-0.5 rounded">
          Bet: {Number(playerHand.betThisRound)}
        </div>
      )}

      {/* Status indicators */}
      {playerHand?.isAllIn && (
        <div className="text-xs text-red-400 font-bold">ALL IN</div>
      )}
      {playerHand?.hasFolded && (
        <div className="text-xs text-gray-500">FOLDED</div>
      )}
      {seat.isReady && !playerHand && (
        <div className="text-xs text-green-400">READY</div>
      )}
    </div>
  );
}
