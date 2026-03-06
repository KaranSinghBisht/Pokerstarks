"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface TableCardProps {
  table: any;
  roomName: string;
  roomBackground: string;
  isWaiting: boolean;
  isShielded: boolean;
  isTrusted: boolean;
  idx: number;
}

function PixelIcon({ type, className = "" }: { type: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    joystick: (
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
        <path d="M11 2h2v10h-2V2zm-3 8h8v2H8v-2zm-3 4h14v6H5v-6zm2 2v2h10v-2H7z" />
      </svg>
    ),
    terminal: (
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
        <path d="M2 4h20v16H2V4zm2 2v12h16V6H4zm3 3h2v2H7V9zm3 3h2v2h-2v-2zm3 3h4v2h-4v-2z" />
      </svg>
    ),
    chip: (
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
        <path d="M6 4h12v2H6V4zm-2 4h16v8H4V8zm2 2v4h12v-4H6zm0 8h12v2H6v-2z" />
      </svg>
    ),
    shield: (
        <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
          <path d="M12 2L4 5v6c0 5.5 3.5 10.5 8 12 4.5-1.5 8-6.5 8-12V5l-8-3zm0 2.2l6 2.2v5.6c0 4.2-2.5 8.1-6 9.3-3.5-1.2-6-5.1-6-9.3V6.4l6-2.2z" />
        </svg>
    )
  };

  const iconKey = type === 'shield' ? 'shield' : (['joystick', 'terminal', 'chip'][Math.abs(type.length % 3)]);

  return (
    <div className={`filter-halftone ${className}`}>
      {icons[iconKey] || icons.joystick}
    </div>
  );
}

export default function TableCard({
  table,
  roomName,
  roomBackground,
  isWaiting,
  isShielded,
  isTrusted,
  idx,
}: TableCardProps) {
  // Extract a theme color from the background string for accents
  const themeColor = roomBackground.includes("#1d4d21") ? "var(--success)" : 
                     roomBackground.includes("#2f2868") ? "var(--secondary)" : 
                     roomBackground.includes("#4f0e3a") ? "var(--primary)" : "var(--primary)";

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: idx * 0.05 }}
      className="group relative"
    >
      {/* Arcade Cabinet Container */}
      <div className="relative bg-[#050508] border-t-8 border-x-4 border-black pixel-border transition-all duration-300 group-hover:shadow-[0_0_40px_rgba(255,0,255,0.15)] overflow-hidden">
        
        {/* Decorative Cabinet Side Panels */}
        <div className="absolute top-0 left-0 w-1 h-full bg-white/5" />
        <div className="absolute top-0 right-0 w-1 h-full bg-black/40" />

        {/* Screen Area with Bezel */}
        <div className="p-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-black border-4 border-[#1a1a2e] shadow-inner">
            {/* The "Game" Scene */}
            <div className={`absolute inset-0 ${roomBackground} opacity-60`} />
            
            {/* Animated Starfield / Noise Background */}
            <div className="absolute inset-0 opacity-30 dither-bg" />
            
            {/* Moving Grid Floor (Mini) */}
            <div className="absolute bottom-0 left-0 right-0 h-1/2 opacity-20" 
                 style={{ 
                   backgroundImage: 'linear-gradient(transparent, rgba(255,255,255,0.1)), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(255,255,255,0.1) 20px), repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(255,255,255,0.1) 20px)',
                   perspective: '50px',
                   transform: 'rotateX(45deg)'
                 }} 
            />

            <div className="scanline" />
            
            {/* Status Overlays (Inside the Screen) */}
            <div className="absolute top-2 left-2 z-20 flex flex-col gap-1">
               <div className={`px-2 py-0.5 font-retro-display text-[6px] text-black ${isWaiting ? 'bg-[var(--success)]' : 'bg-[var(--danger)] animate-pulse'}`}>
                  {isWaiting ? "TABLE: OPEN" : "GAME: ACTIVE"}
               </div>
               {isShielded && (
                 <div className="px-2 py-0.5 font-retro-display text-[6px] bg-purple-600 text-white">
                    ENCRYPTION: ON
                 </div>
               )}
               {!isTrusted && (
                 <div className="px-2 py-0.5 font-retro-display text-[6px] bg-orange-600 text-white animate-pulse">
                    UNVERIFIED_SRC
                 </div>
               )}
            </div>

            <div className="absolute top-2 right-2 z-20 font-retro-body text-[8px] text-white/40">
               ID_{table.tableId.toString().padStart(4, '0')}
            </div>

            {/* Central Icon */}
            <div className="relative z-10 flex h-full flex-col items-center justify-center">
              <motion.div 
                 animate={{ y: [0, -4, 0], filter: ["brightness(1)", "brightness(1.3)", "brightness(1)"] }}
                 transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                 className="mb-3 h-14 w-14"
              >
                 <PixelIcon type={isShielded ? 'shield' : roomName} className={`h-full w-full ${isShielded ? 'text-purple-400' : 'text-white/80'} filter-halftone`} />
              </motion.div>
              
              <div className="font-retro-display text-[9px] text-white tracking-[0.2em] uppercase glow-text-primary">
                {roomName}
              </div>
            </div>

            {/* Screen Reflection Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-50" />
          </div>
        </div>

        {/* Control Panel / Stats Area */}
        <div className="bg-[#0a0a15] border-t-4 border-black p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
             <div className="bg-black/40 p-2 border border-white/5">
                <div className="font-retro-display text-[6px] text-white/30 mb-1 uppercase">Stakes</div>
                <div className="font-retro-display text-[8px] text-[var(--secondary)]">
                  {isShielded
                    ? `${Number(table.smallBlind) / 1e18}/${Number(table.bigBlind) / 1e18}`
                    : `${Number(table.smallBlind)}/${Number(table.bigBlind)}`}
                </div>
             </div>
             <div className="bg-black/40 p-2 border border-white/5">
                <div className="font-retro-display text-[6px] text-white/30 mb-1 uppercase">Seated</div>
                <div className="font-retro-display text-[8px] text-white">
                  {table.playerCount} / {table.maxPlayers}
                </div>
             </div>
          </div>

          <div className="bg-black/40 p-2 border border-white/5 flex justify-between items-center">
             <div className="font-retro-display text-[6px] text-white/30 uppercase">Min Buy-In</div>
             <div className="font-retro-display text-[8px] text-white">
                {isShielded ? `${Number(table.minBuyIn) / 1e18} STRK` : Number(table.minBuyIn)}
             </div>
          </div>

          {isWaiting ? (
            <Link
              href={`/table/${table.tableId}`}
              className="group relative block w-full bg-[var(--primary)] py-3 text-center font-retro-display text-[9px] text-white pixel-border-sm hover:brightness-110 active:translate-y-0.5 transition-all overflow-hidden"
            >
              <span className="relative z-10">INITIALIZE SESSION</span>
              <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-500 skew-x-[-20deg]" />
            </Link>
          ) : (
            <Link
              href={`/spectate/${table.tableId}`}
              className="block w-full bg-slate-800 py-3 text-center font-retro-display text-[9px] text-slate-400 pixel-border-sm hover:bg-slate-700 hover:text-white transition-all uppercase"
            >
              SPECTATE MODE
            </Link>
          )}
        </div>

        {/* Bottom Cabinet Shadow */}
        <div className="h-2 bg-black/80" />
      </div>
    </motion.div>
  );
}
