"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PlayerAction } from "@/lib/constants";

interface BettingControlsProps {
  currentBet: bigint;
  playerBet: bigint;
  playerChips: bigint;
  bigBlind: bigint;
  isPlayerTurn: boolean;
  onAction: (action: PlayerAction, amount: bigint) => void;
}

function ArcadeButton({ 
  onClick, 
  color, 
  label, 
  sublabel, 
  disabled 
}: { 
  onClick: () => void; 
  color: 'red' | 'blue' | 'green' | 'yellow'; 
  label: string; 
  sublabel?: string;
  disabled?: boolean;
}) {
  const colors = {
    red: 'bg-[#ff003c] border-[#80001e] shadow-[0_0_20px_rgba(255,0,60,0.3)]',
    blue: 'bg-[#00f3ff] border-[#007a80] shadow-[0_0_20px_rgba(0,243,255,0.3)]',
    green: 'bg-[#00ff66] border-[#008033] shadow-[0_0_20px_rgba(0,255,102,0.3)]',
    yellow: 'bg-[#ffd700] border-[#806c00] shadow-[0_0_20px_rgba(255,215,0,0.3)]',
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.9, y: 4 }}
      onClick={onClick}
      disabled={disabled}
      className={`relative h-20 w-24 flex flex-col items-center justify-center border-b-8 rounded-sm font-retro-display transition-all ${disabled ? 'bg-slate-800 border-slate-900 opacity-50 grayscale' : colors[color]} pixel-border-sm`}
    >
      <div className="text-[10px] text-black font-bold uppercase tracking-tighter">{label}</div>
      {sublabel && <div className="text-[7px] text-black/60 mt-1 uppercase">{sublabel}</div>}
      
      {/* Button Shine */}
      <div className="absolute top-1 left-1 right-1 h-1/2 bg-white/20 rounded-t-sm pointer-events-none" />
    </motion.button>
  );
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
      <div className="mx-4 bg-black/90 p-6 pixel-border border-black flex items-center justify-center gap-4">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="font-retro-display text-[10px] text-[var(--primary)] uppercase tracking-widest glow-text-primary">
          WAITING FOR OPPONENT'S MOVE...
        </span>
      </div>
    );
  }

  return (
    <div className="mx-2 md:mx-6 bg-[#0a0a18] border-t-8 border-x-4 border-black p-6 pixel-border relative overflow-hidden">
      <div className="scanline" />
      <div className="absolute inset-0 dither-bg opacity-5" />
      
      <div className="relative z-10 flex flex-wrap items-end justify-center gap-8">
        {/* Main Action Buttons */}
        <div className="flex gap-4">
          <ArcadeButton 
            label="FOLD" 
            color="red" 
            onClick={() => onAction(PlayerAction.Fold, 0n)} 
          />
          
          {canCheck ? (
            <ArcadeButton 
              label="CHECK" 
              color="blue" 
              onClick={() => onAction(PlayerAction.Check, 0n)} 
            />
          ) : (
            <ArcadeButton 
              label="CALL" 
              sublabel={Number(callAmount).toString()} 
              color="blue" 
              disabled={!canCall}
              onClick={() => onAction(PlayerAction.Call, callAmount)} 
            />
          )}

          <ArcadeButton 
            label="RAISE" 
            color="green" 
            onClick={() => onAction(PlayerAction.AllIn, playerChips)} 
          />
        </div>

        {/* Bet Sizing Area */}
        <div className="flex-1 min-w-[300px] bg-black/40 p-4 border-2 border-white/5 pixel-border-sm">
           <div className="flex justify-between mb-3">
              <span className="font-retro-display text-[8px] text-white/40 uppercase">Bet Magnitude</span>
              <div className="flex items-baseline gap-2">
                 <span className="font-retro-display text-lg text-[var(--accent)]">{betAmount || Number(minRaise)}</span>
                 <span className="font-retro-display text-[8px] text-white/40">STRK</span>
              </div>
           </div>

           <div className="relative h-12 bg-black flex items-center px-4 border-2 border-white/5">
              <div className="absolute inset-y-0 left-0 bg-[var(--primary)]/20" style={{ width: `${sliderValue}%` }} />
              <input
                type="range"
                min={Number(minRaise)}
                max={Number(playerChips)}
                value={Math.max(Number(minRaise), Number(betAmount || minRaise))}
                onChange={(e) => setBetAmount(e.target.value)}
                className="relative z-10 w-full h-full cursor-pointer appearance-none bg-transparent accent-[var(--primary)]"
              />
           </div>

           <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { label: '1/2', val: String(Math.max(1, Number(playerChips / 2n))) },
                { label: 'POT', val: String(Number(currentBet || bigBlind)) },
                { label: 'MAX', val: String(Number(playerChips)) },
              ].map(preset => (
                <button 
                  key={preset.label}
                  onClick={() => setBetAmount(preset.val)}
                  className="py-2 bg-white/5 border border-white/10 font-retro-display text-[8px] hover:bg-white/10 transition-colors uppercase"
                >
                  {preset.label}
                </button>
              ))}
              <button 
                onClick={commitBet}
                disabled={!canBet}
                className="bg-[var(--secondary)] text-black font-retro-display text-[8px] hover:brightness-110 active:scale-95 disabled:opacity-30 uppercase"
              >
                CONFIRM
              </button>
           </div>
        </div>

        {/* Arcade Stick / Decorative */}
        <div className="hidden lg:flex flex-col items-center gap-2 opacity-40 grayscale group-hover:grayscale-0 transition-all">
           <div className="h-16 w-4 bg-slate-700 rounded-full border-b-4 border-black relative">
              <div className="absolute -top-6 -left-3 h-10 w-10 bg-red-600 rounded-full border-b-4 border-red-900 shadow-xl" />
           </div>
           <div className="font-retro-display text-[6px] uppercase">Analog Input</div>
        </div>
      </div>
    </div>
  );
}
