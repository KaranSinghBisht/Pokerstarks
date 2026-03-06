"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useStarknet } from "@/providers/StarknetProvider";
import BrandWordmark from "@/components/brand/BrandWordmark";
import WalletSelector from "@/components/ui/WalletSelector";

function PixelIcon({ type, className = "" }: { type: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    connect: (
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
        <path d="M7 10h10v4h-2v2h-6v-2H7v-4zM9 12h6v1H9v-1z M5 8h2v2H5z M17 8h2v2h-2z M5 14h2v2H5z M17 14h2v2h-2z M11 16h2v4h-2z" />
      </svg>
    ),
    join: (
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
        <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm3 3h6v1H9V9zm0 3h6v1H9v-1zm0 3h3v1H9v-1z" />
      </svg>
    ),
    win: (
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
        <path d="M5 3h14v2H5V3zm2 4h10v2H7V7zm3 4h4v8h-4v-8zm-6 2h4v4H4v-4zm12 0h4v4h-4v-4z" />
      </svg>
    ),
    lock: (
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
        <path d="M12 2a5 5 0 0 0-5 5v3H5v11h14V10h-2V7a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3zm-5 8h10v7H7v-7zm5 2a1 1 0 1 0 1 1 1 1 0 0 0-1-1z" />
      </svg>
    ),
    shuffle: (
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
        <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7zM7 7h1v1H7V7zm9 0h1v1h-1V7zm-9 9h1v1H7v-1zm9 0h1v1h-1v-1z" />
      </svg>
    ),
    reveal: (
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current">
        <path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 5-5 5 5 0 0 1-5 5zm0-8a3 3 0 1 0 3 3 3 3 0 0 0-3-3z" />
      </svg>
    ),
  };

  return (
    <div className={`filter-halftone ${className}`}>
      {icons[type] || null}
    </div>
  );
}

function SVGEffects() {
  return (
    <svg className="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <defs>
        <filter id="halftone">
          <feFlood floodColor="black" result="black" />
          <feComposite in="SourceGraphic" in2="black" operator="over" />
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues="0 1" />
            <feFuncG type="discrete" tableValues="0 1" />
            <feFuncB type="discrete" tableValues="0 1" />
          </feComponentTransfer>
          <feMorphology operator="dilate" radius="0.5" />
        </filter>
        <filter id="dither">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" result="noise" />
          <feColorMatrix type="saturate" values="0" />
          <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
        </filter>
      </defs>
    </svg>
  );
}

function PrivacyVault() {
  return (
    <div className="pixel-border-primary relative aspect-square w-full max-w-md overflow-hidden bg-black/90 p-8">
      {/* Moving Laser Scan */}
      <motion.div 
        animate={{ top: ['-10%', '110%'] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        className="absolute left-0 right-0 h-[2px] bg-[var(--primary)] shadow-[0_0_15px_var(--primary)] z-30 opacity-40"
      />

      {/* Circuit Pattern Background */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
        style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 30 L30 30 L30 0 M60 30 L30 30 L30 60' fill='none' stroke='%23ff00ff' stroke-width='1'/%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px'
        }} 
      />
      
      <div className="scanline" />
      
      {/* Vault Frame */}
      <div className="absolute inset-4 border-2 border-[var(--primary)]/20 opacity-40 z-10" />
      
      <div className="relative flex h-full flex-col items-center justify-center z-20">
        {/* The "Shielded" Chip */}
        <div className="relative mb-8 flex h-32 w-32 items-center justify-center rounded-full border-4 border-dashed border-[var(--primary)]/50 p-4 animate-float">
          <div className="h-full w-full rounded-full bg-[var(--primary)]/10 flex items-center justify-center backdrop-blur-sm">
             <div className="font-retro-display text-xs text-[var(--primary)] glow-text-primary">STRK</div>
          </div>
          {/* Rotating Ring */}
          <div className="absolute -inset-2 rounded-full border-2 border-t-[var(--secondary)] border-r-[var(--secondary)]/30 border-transparent animate-spin" style={{ animationDuration: '3s' }} />
        </div>

        {/* Status Display */}
        <div className="brand-panel w-full p-4 text-center bg-black/60 backdrop-blur-md">
          <div className="font-retro-display text-[8px] text-white/40 mb-2 uppercase tracking-widest">
            Privacy Status
          </div>
          <div className="flex items-center justify-center gap-3">
            <span className="h-2 w-2 rounded-full bg-[var(--success)] shadow-[0_0_8px_var(--success)] animate-pulse" />
            <span className="font-retro-display text-[10px] text-[var(--primary)] uppercase">
              Shielding Active
            </span>
          </div>
        </div>
        
        {/* Floating Hex Data */}
        <div className="absolute bottom-4 left-4 font-retro-body text-[10px] text-white/30">
          0x4718...87c9
        </div>
        <div className="absolute top-4 right-4 font-retro-body text-[10px] text-white/30 uppercase tracking-tighter">
          ZK-Proof: Verified
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { isConnected, connecting, disconnect, address, error } = useStarknet();
  const [showWalletSelector, setShowWalletSelector] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden text-white">
      <SVGEffects />
      <div className="retro-grid-container fixed inset-0 z-0">
        <div className="retro-grid" />
      </div>
      <nav className="relative z-30 mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-7xl items-center justify-between rounded-sm px-6 py-4 brand-topbar">
        <BrandWordmark href="/" subtitle="ZK POKER ON STARKNET" />
        <div className="flex items-center gap-6">
          <Link
            href="/lobby"
            className="hidden font-retro-display text-[10px] uppercase tracking-widest brand-link md:block"
          >
            Lobby
          </Link>
          <Link
            href="/arena"
            className="hidden font-retro-display text-[10px] uppercase tracking-widest brand-link md:block"
          >
            Arena
          </Link>
          <button
            onClick={isConnected ? disconnect : () => setShowWalletSelector(true)}
            disabled={connecting}
            className="px-6 py-2 font-retro-display text-[10px] brand-btn-cyan disabled:opacity-50 active:scale-95 transition-transform"
          >
            {connecting
              ? "CONNECTING..."
              : isConnected
                ? `${address?.slice(0, 6)}...${address?.slice(-4)}`
                : "CONNECT WALLET"}
          </button>
        </div>
      </nav>

      <main className="relative z-10 flex flex-col items-center justify-center px-4 pb-24 pt-12 text-center">
        {error && (
          <div className="mb-6 max-w-3xl border-l-4 border-red-500 bg-red-500/10 p-3 font-retro-display text-[10px] text-red-200">
            {error}
          </div>
        )}
        
        {/* Floating Decorative Cards with Life */}
        <motion.div 
          animate={{ y: [0, -15, 0], rotate: [-5, 5, -5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[15%] top-24 hidden opacity-60 lg:block pixel-card-shadow"
        >
          <div className="h-24 w-16 p-1 card-hover-effect">
            <img src="/retro/cards/front/hearts_A.png" alt="A" className="h-full w-full object-contain" />
          </div>
        </motion.div>

        <motion.div 
          animate={{ y: [0, 15, 0], rotate: [10, -10, 10] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute right-[15%] top-40 hidden opacity-60 lg:block pixel-card-shadow"
        >
          <div className="h-24 w-16 p-1 card-hover-effect">
            <img src="/retro/cards/front/spades_K.png" alt="K" className="h-full w-full object-contain" />
          </div>
        </motion.div>

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <Image
            src="/logo.png"
            alt="Pokerstarks"
            width={140}
            height={140}
            className="mb-8 drop-shadow-[0_0_35px_rgba(255,0,255,0.4)]"
            priority
          />
        </motion.div>

        <h1 className="font-retro-display glow-text-primary mb-6 text-5xl leading-tight tracking-tight text-white md:text-8xl">
          POKER
          <br />
          <span className="text-[var(--primary)] glitch-text">STARKS</span>
        </h1>

        <p className="font-retro-display mb-12 text-xs uppercase tracking-[0.3em] text-[var(--secondary)] md:text-sm opacity-80">
          — FULLY ON-CHAIN ZK POKER —
        </p>

        <div className="mb-16 flex flex-col gap-8 md:flex-row">
          <Link
            href="/lobby"
            className="group relative px-12 py-5 font-retro-display text-xs brand-btn-cyan overflow-hidden"
          >
            <span className="relative z-10">ENTER LOBBY</span>
            <motion.div 
              className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-500"
              style={{ skewX: -20 }}
            />
          </Link>
          <a
            href="#how-it-works"
            className="group px-12 py-5 font-retro-display text-xs brand-btn-primary active:scale-95 transition-transform"
          >
            HOW IT WORKS
          </a>
        </div>

        <div className="w-full max-w-5xl px-4">
          <div className="border-4 border-black bg-[#050508] p-3 pixel-border relative overflow-hidden">
            <div className="scanline" />
            <div className="relative flex aspect-video w-full flex-col overflow-hidden bg-[#0a0a15]">
              {/* Table UI Header */}
              <div className="flex items-center justify-between border-b-2 border-white/5 bg-black/40 px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  <span className="font-retro-display text-[9px] text-white/60">LIVE_HAND_#8421</span>
                </div>
                <div className="font-retro-display text-[9px] text-[var(--primary)]">
                  POT: 1,240 STRK
                </div>
              </div>

              <div className="relative flex flex-1 items-center justify-center p-8">
                {/* Community Cards Preview */}
                <div className="flex gap-4">
                  {[
                    "/retro/cards/front/hearts_A.png",
                    "/retro/cards/front/spades_K.png",
                    "/retro/cards/front/diamonds_10.png",
                    "/retro/cards/back/back_red.png",
                    "/retro/cards/back/back_red.png"
                  ].map((src, i) => (
                    <motion.div 
                      key={i}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: i < 3 ? 1 : 0.4 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className={`h-32 w-22 pixel-card-shadow ${i >= 3 ? 'grayscale blur-[1px]' : 'card-hover-effect'}`}
                    >
                      <img src={src} alt="Card" className="h-full w-full object-contain" />
                    </motion.div>
                  ))}
                </div>

                {/* Technical Log Overlay */}
                <div className="absolute bottom-4 left-6 text-left font-retro-body text-[10px] text-[var(--secondary)]/60">
                   <div className="animate-pulse"> {">"} SHUFFLE_PROOF: VERIFIED</div>
                   <div className="opacity-40"> {">"} PARTIAL_DECRYPT: OK</div>
                   <div className="opacity-40"> {">"} STATE: WAITING_FOR_TURN</div>
                </div>

                {/* Player Avatars */}
                <div className="absolute inset-0 pointer-events-none">
                   <div className="absolute top-1/2 left-10 -translate-y-1/2 flex flex-col items-center gap-2 opacity-40">
                      <div className="h-12 w-12 border-2 border-white/20 bg-white/5 filter-halftone flex items-center justify-center text-xl">🤖</div>
                      <div className="font-retro-display text-[7px] text-white/40">BOT_ALPHA</div>
                   </div>
                   <div className="absolute top-1/2 right-10 -translate-y-1/2 flex flex-col items-center gap-2">
                      <div className="h-16 w-16 border-2 border-[var(--primary)] bg-[var(--primary)]/10 filter-halftone flex items-center justify-center text-2xl shadow-[0_0_15px_var(--primary)]">🧠</div>
                      <div className="font-retro-display text-[8px] text-[var(--primary)]">YOU</div>
                   </div>
                </div>
              </div>

              {/* Action Preview */}
              <div className="bg-black/60 px-6 py-4 flex justify-center gap-4 border-t-2 border-white/5">
                 {['FOLD', 'CALL', 'RAISE'].map(action => (
                   <div key={action} className="px-4 py-2 border-2 border-white/10 font-retro-display text-[8px] text-white/30 lowercase italic">
                     {action}...
                   </div>
                 ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between px-4 font-retro-display text-[9px] uppercase text-white/40 tracking-widest">
            <span className="flex items-center gap-2">
               <span className="h-1 w-1 bg-[var(--primary)]" /> NO CENTRAL DEALER
            </span>
            <span className="flex items-center gap-2">
               <span className="h-1 w-1 bg-[var(--primary)]" /> ZK-SHUFFLE v2.1
            </span>
            <span className="flex items-center gap-2">
               <span className="h-1 w-1 bg-[var(--primary)]" /> STARKNET SEPOLIA
            </span>
          </div>
        </div>
      </main>

      <section id="how-it-works" className="relative overflow-hidden bg-black/35 py-20">
        <div className="relative z-10 mx-auto max-w-7xl px-8">
          <h2 className="mb-16 text-center font-retro-display text-xl text-white">
            3 STEPS TO WIN
          </h2>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              ["1", "connect", "CONNECT", "Link your wallet and keep your game flow on-chain."],
              ["2", "join", "JOIN LOBBY", "Pick a table by stakes and player count."],
              ["3", "win", "PLAY & WIN", "Use skill, read opponents, and stack chips."],
            ].map(([idx, icon, title, desc]) => (
              <div key={idx} className="flex flex-col items-center text-center">
                <div className="relative mb-7 flex h-24 w-24 items-center justify-center border-4 border-[var(--secondary)] bg-[var(--secondary)]/10">
                  <PixelIcon type={icon} className="h-12 w-12 text-[var(--secondary)]" />
                  <div className="absolute -left-4 -top-4 flex h-8 w-8 items-center justify-center bg-[var(--secondary)] font-retro-display text-[10px] text-black">
                    {idx}
                  </div>
                </div>
                <h3 className="mb-3 font-retro-display text-xs text-white">{title}</h3>
                <p className="max-w-sm text-2xl leading-tight text-white/70 font-retro-body">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEW SECTION: THE ZK-PROTOCOL */}
      <section className="relative border-y-4 border-black bg-[#0a0a18] py-24">
        <div className="dither-bg absolute inset-0 opacity-20" />
        <div className="relative z-10 mx-auto max-w-7xl px-8">
          <div className="mb-16 flex flex-col items-center text-center">
            <h2 className="font-retro-display glow-text-primary mb-4 text-2xl uppercase tracking-tighter text-[var(--primary)]">
              THE ZERO-KNOWLEDGE PROTOCOL
            </h2>
            <div className="h-1 w-32 bg-[var(--primary)]" />
            <p className="font-retro-body mt-6 max-w-2xl text-xl text-white/60">
              Pokerstarks implements a non-custodial "Mental Poker" protocol. No central server knows the deck. Fairness is mathematically guaranteed.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                title: "DISTRIBUTED KEYS",
                desc: "Every player generates a shard of the aggregate encryption key. No single entity can decrypt cards alone.",
                icon: "lock",
              },
              {
                title: "ZK-SHUFFLE",
                desc: "Each player shuffles and re-encrypts the deck, providing a Noir ZK-proof that no cards were added or removed.",
                icon: "shuffle",
              },
              {
                title: "PROVABLE REVEAL",
                desc: "Cards are revealed via partial decryption. Noir circuits prove the reveal matches the original encrypted blob.",
                icon: "reveal",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="brand-panel group p-8 transition-transform hover:-translate-y-2"
              >
                <div className="mb-6 h-12 w-12">
                   <PixelIcon type={item.icon} className="h-full w-full text-[var(--secondary)]" />
                </div>
                <h3 className="font-retro-display mb-4 text-[10px] text-[var(--secondary)]">
                  {item.title}
                </h3>
                <p className="font-retro-body text-lg leading-snug text-white/70">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEW SECTION: TONGO PRIVACY */}
      <section className="relative overflow-hidden py-32">
        <div className="retro-grid-container absolute inset-0 opacity-5">
          <div className="retro-grid" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <PrivacyVault />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="font-retro-display glow-text-primary mb-8 text-3xl text-white">
                ULTIMATE BANKROLL
                <br />
                <span className="text-[var(--primary)]">PRIVACY</span>
              </h2>
              <p className="font-retro-body mb-8 text-2xl text-white/70">
                Integrated with <span className="text-[var(--secondary)]">Tongo</span>, Pokerstarks supports confidential STRK. Play without revealing your total balance to the world.
              </p>
              <ul className="space-y-4 font-retro-display text-[9px] text-[var(--secondary)]">
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 bg-[var(--primary)]" />
                  SHIELDED BUY-INS & CASHOUTS
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 bg-[var(--primary)]" />
                  ZERO KNOWLEDGE TRANSACTION HISTORIES
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 bg-[var(--primary)]" />
                  FULLY ANONYMOUS TABLE PRESENCE
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* NEW SECTION: DOJO ENGINE */}
      <section className="relative border-t-4 border-black bg-black py-20">
        <div className="mx-auto max-w-7xl px-8">
          <div className="brand-panel flex flex-col items-center justify-between gap-8 p-8 md:flex-row md:p-12">
            <div>
              <h3 className="font-retro-display mb-2 text-xs text-white uppercase">
                POWERED BY DOJO, STARKNET & CARTRIDGE
              </h3>
              <p className="font-retro-body text-xl text-white/50">
                High-performance execution meets provable on-chain state and seamless session management.
              </p>
            </div>
            <div className="flex gap-8">
              <div className="text-center">
                <div className="font-retro-display text-lg text-[var(--secondary)]">
                  900+
                </div>
                <div className="font-retro-display text-[8px] text-white/40 uppercase">
                  HANDS/HOUR
                </div>
              </div>
              <div className="text-center">
                <div className="font-retro-display text-lg text-[var(--primary)]">
                  $0.01
                </div>
                <div className="font-retro-display text-[8px] text-white/40 uppercase">
                  AVG GAS FEE
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t-4 border-black bg-black/40 px-8 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-4">
            <BrandWordmark href="/" compact />
            <span className="font-retro-display text-[10px] text-white/70">© 2026</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6">
            {["Twitter", "Discord", "Docs", "Audits"].map((item) => (
              <button
                key={item}
                type="button"
                className="font-retro-display text-[10px] uppercase text-white/55 transition-colors hover:text-[var(--secondary)]"
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 font-retro-display text-[10px] uppercase text-white/65">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            ZK-NETWORK: OPERATIONAL
          </div>
        </div>
      </footer>

      {showWalletSelector && (
        <WalletSelector onClose={() => setShowWalletSelector(false)} />
      )}
    </div>
  );
}
