"use client";

import { motion, AnimatePresence } from "framer-motion";
import Card from "./Card";
import type { SeatData, PlayerHandData } from "@/lib/types";

interface PlayerSeatProps {
  seatIndex: number;
  seat: SeatData;
  playerHand?: PlayerHandData;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isLocalPlayer: boolean;
  position: { top: string; left: string };
  localHoleCards?: [number, number] | null;
  canJoin?: boolean;
  onJoin?: () => void;
  isPrivacyMode?: boolean;
}

const BOT_EMOJIS = ["😎", "🤖", "👾", "🎲", "🕹️", "🃏"];

export default function PlayerSeat({
  seatIndex,
  seat,
  playerHand,
  isCurrentTurn,
  isDealer,
  isLocalPlayer,
  position,
  localHoleCards,
  canJoin,
  onJoin,
  isPrivacyMode,
}: PlayerSeatProps) {
  if (!seat.isOccupied) {
    return (
      <div
        className="absolute flex flex-col items-center gap-2"
        style={{
          top: position.top,
          left: position.left,
          transform: "translate(-50%, -50%)",
        }}
      >
        <button
          onClick={canJoin ? onJoin : undefined}
          disabled={!canJoin}
          className={`flex h-14 w-14 items-center justify-center border-4 bg-black/35 pixel-border-sm ${
            canJoin
              ? isPrivacyMode
                ? "border-purple-500/60 text-purple-400 transition-colors hover:bg-purple-500/10"
                : "border-[var(--secondary)]/60 text-[var(--secondary)] transition-colors hover:bg-[var(--secondary)]/10"
              : "border-white/20 text-white/30"
          }`}
        >
          {canJoin && isPrivacyMode ? "\u{1F6E1}" : canJoin ? "+" : "\u25A1"}
        </button>
        <span className={`font-retro-display text-[8px] ${isPrivacyMode && canJoin ? "text-purple-400" : "text-white/45"}`}>
          {canJoin ? (isPrivacyMode ? "PRIVATE JOIN" : "JOIN") : "EMPTY"}
        </span>
      </div>
    );
  }

  const shortAddr = `${seat.player.slice(0, 6)}...${seat.player.slice(-4)}`;
  const chips = Number(seat.chips);

  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={{
        top: position.top,
        left: position.left,
        transform: "translate(-50%, -50%)",
      }}
    >
      {isDealer && (
        <div className="absolute -left-4 -top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-white font-retro-display text-[8px] text-black">
          D
        </div>
      )}

      <div
        className={`flex h-14 w-14 items-center justify-center border-4 bg-slate-800 pixel-border-sm ${
          isCurrentTurn
            ? "border-[var(--accent)] animate-turn-glow"
            : playerHand?.hasFolded
              ? "border-slate-700 grayscale opacity-70"
              : isLocalPlayer
                ? "border-[var(--secondary)]"
                : "border-[var(--primary)]/50"
        }`}
      >
        <span className="text-xl">{isLocalPlayer ? "🧠" : BOT_EMOJIS[seatIndex % BOT_EMOJIS.length]}</span>
      </div>

      <div className="bg-black px-3 py-1 text-center pixel-border-sm">
        <span className="block font-retro-display text-[8px] text-white/85">
          {isLocalPlayer ? "YOU" : shortAddr}
        </span>
        {isPrivacyMode && !isLocalPlayer ? (
          <span className="font-retro-display text-[9px] text-purple-400">SHIELDED</span>
        ) : (
          <span className="font-retro-display text-[9px] text-white">{chips} CHIP</span>
        )}
      </div>

      {isCurrentTurn && (
        <div className="absolute -right-7 -top-6 rotate-12 bg-[var(--accent)] px-2 py-1 font-retro-display text-[7px] text-black pixel-border-sm">
          THINKING...
        </div>
      )}

      {playerHand && !playerHand.hasFolded && (
        <div className="mt-0.5 flex gap-0.5">
          <Card
            cardId={
              isLocalPlayer
                ? (localHoleCards?.[0] ?? playerHand.holeCard1Id)
                : playerHand.holeCard1Id
            }
            small
          />
          <Card
            cardId={
              isLocalPlayer
                ? (localHoleCards?.[1] ?? playerHand.holeCard2Id)
                : playerHand.holeCard2Id
            }
            small
          />
        </div>
      )}

      <AnimatePresence>
        {playerHand && playerHand.betThisRound > 0n && (
          <motion.div
            key="bet"
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="bg-black/80 px-2 py-0.5 font-retro-display text-[8px] text-[var(--secondary)] pixel-border-sm"
          >
            BET {Number(playerHand.betThisRound)}
          </motion.div>
        )}
      </AnimatePresence>

      {playerHand?.isAllIn && (
        <div className="font-retro-display text-[8px] text-red-400">ALL IN</div>
      )}
      {playerHand?.hasFolded && (
        <div className="font-retro-display text-[8px] text-slate-500">FOLDED</div>
      )}
      {seat.isReady && !playerHand && (
        <div className="font-retro-display text-[8px] text-green-400">READY</div>
      )}
    </div>
  );
}

