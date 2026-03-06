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
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
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
  isSmallBlind,
  isBigBlind,
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
        <motion.button
          whileHover={{ scale: 1.1, backgroundColor: "rgba(0, 243, 255, 0.1)" }}
          whileTap={{ scale: 0.9 }}
          onClick={canJoin ? onJoin : undefined}
          disabled={!canJoin}
          className={`flex h-16 w-16 items-center justify-center border-4 bg-black/35 pixel-border-sm ${
            canJoin
              ? isPrivacyMode
                ? "border-purple-500/60 text-purple-400"
                : "border-[var(--secondary)]/60 text-[var(--secondary)]"
              : "border-white/10 text-white/10"
          }`}
        >
          {canJoin ? "+" : "---"}
        </motion.button>
        <span className={`font-retro-display text-[7px] uppercase tracking-widest ${isPrivacyMode && canJoin ? "text-purple-400" : "text-white/30"}`}>
          {canJoin ? "OPEN SEAT" : "LOCKED"}
        </span>
      </div>
    );
  }

  const shortAddr = `${seat.player.slice(0, 6)}...${seat.player.slice(-4)}`;
  const chips = Number(seat.chips);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="absolute flex flex-col items-center z-20"
      style={{
        top: position.top,
        left: position.left,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Cards - Fanned out behind or above */}
      <div className="relative h-12 w-20 mb-1">
        {playerHand && !playerHand.hasFolded && (
          <div className="flex justify-center -space-x-6">
            <motion.div 
               initial={{ rotate: -15, x: -10, opacity: 0 }}
               animate={{ rotate: -10, x: 0, opacity: 1 }}
               className="pixel-card-shadow"
            >
              <Card
                cardId={isLocalPlayer ? (localHoleCards?.[0] ?? playerHand.holeCard1Id) : playerHand.holeCard1Id}
                small
              />
            </motion.div>
            <motion.div 
               initial={{ rotate: 15, x: 10, opacity: 0 }}
               animate={{ rotate: 10, x: 0, opacity: 1 }}
               className="pixel-card-shadow"
            >
              <Card
                cardId={isLocalPlayer ? (localHoleCards?.[1] ?? playerHand.holeCard2Id) : playerHand.holeCard2Id}
                small
              />
            </motion.div>
          </div>
        )}
      </div>

      {/* Status Badges - Top Row */}
      <div className="flex gap-1 mb-1 h-4">
        {isDealer && (
          <div className="bg-white text-black px-1.5 py-0.5 font-retro-display text-[7px] border border-black shadow-sm">D</div>
        )}
        {isSmallBlind && (
          <div className="bg-[var(--secondary)] text-black px-1.5 py-0.5 font-retro-display text-[7px] border border-black shadow-sm">SB</div>
        )}
        {isBigBlind && (
          <div className="bg-[var(--primary)] text-white px-1.5 py-0.5 font-retro-display text-[7px] border border-black shadow-sm">BB</div>
        )}
      </div>

      {/* Avatar HUD */}
      <div className="relative">
        <div
          className={`flex h-16 w-16 items-center justify-center border-4 bg-[#0a0a18] transition-all duration-300 ${
            isCurrentTurn
              ? "border-[var(--accent)] shadow-[0_0_25px_rgba(255,215,0,0.4)] scale-110 z-30"
              : playerHand?.hasFolded
                ? "border-slate-800 opacity-40 grayscale"
                : isLocalPlayer
                  ? "border-[var(--secondary)]"
                  : "border-white/20"
          } pixel-border-sm`}
        >
          <span className="text-2xl">{isLocalPlayer ? "🧠" : BOT_EMOJIS[seatIndex % BOT_EMOJIS.length]}</span>
          
          {/* Turn Timer Glow (Circular) */}
          {isCurrentTurn && (
            <svg className="absolute -inset-2 h-20 w-20 -rotate-90 pointer-events-none">
              <circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeDasharray="226"
                className="animate-[timer_30s_linear_infinite]"
              />
            </svg>
          )}
        </div>

        {/* Action Callouts */}
        <AnimatePresence>
          {isCurrentTurn && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 45 }}
              exit={{ opacity: 0 }}
              className="absolute top-1/2 -translate-y-1/2 bg-[var(--accent)] text-black px-2 py-1 font-retro-display text-[6px] pixel-border-sm whitespace-nowrap"
            >
              YOUR TURN
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Name & Chips Panel */}
      <div className={`mt-2 min-w-[80px] bg-black/80 border-2 border-black p-1.5 text-center pixel-border-sm transition-opacity ${playerHand?.hasFolded ? "opacity-40" : ""}`}>
        <div className={`font-retro-display text-[7px] mb-0.5 uppercase ${isLocalPlayer ? "text-[var(--secondary)]" : "text-white/60"}`}>
          {isLocalPlayer ? "YOU" : shortAddr}
        </div>
        <div className="font-retro-display text-[9px] text-white">
          {isPrivacyMode && !isLocalPlayer ? (
            <span className="text-purple-400">SHIELDED</span>
          ) : (
            <span>{chips.toLocaleString()} <span className="text-[7px] text-white/40">CHIPS</span></span>
          )}
        </div>
      </div>

      {/* Live Bet Bubble */}
      <AnimatePresence>
        {playerHand && playerHand.betThisRound > 0n && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 35 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute z-40 bg-[var(--secondary)] text-black px-2 py-1 font-retro-display text-[8px] pixel-border-sm font-bold shadow-xl"
          >
            {Number(playerHand.betThisRound)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result Badges */}
      <div className="absolute -bottom-8 flex flex-col items-center gap-1">
        {playerHand?.isAllIn && (
          <div className="bg-red-600 text-white px-2 py-0.5 font-retro-display text-[6px] animate-pulse">ALL-IN</div>
        )}
        {playerHand?.hasFolded && (
          <div className="text-slate-500 font-retro-display text-[7px] uppercase tracking-tighter italic">Folded</div>
        )}
      </div>
    </motion.div>
  );
}
