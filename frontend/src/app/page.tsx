"use client";

import Link from "next/link";
import { useStarknet } from "@/providers/StarknetProvider";
import BrandWordmark from "@/components/brand/BrandWordmark";

export default function LandingPage() {
  const { isConnected, connecting, connect, disconnect, address, error } = useStarknet();

  return (
    <div className="min-h-screen overflow-x-hidden text-white">
      <nav className="relative z-20 mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-7xl items-center justify-between rounded-sm px-6 py-4 brand-topbar">
        <BrandWordmark href="/" subtitle="ZK POKER ON STARKNET" />
        <div className="flex items-center gap-6">
          <Link
            href="/lobby"
            className="hidden font-retro-display text-[10px] uppercase tracking-widest brand-link md:block"
          >
            Lobby
          </Link>
          <button
            onClick={isConnected ? disconnect : connect}
            disabled={connecting}
            className="px-6 py-2 font-retro-display text-[10px] brand-btn-cyan disabled:opacity-50"
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
        <div className="animate-float absolute left-1/4 top-20 hidden opacity-60 lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/retro/cards/front/hearts_A.png"
            alt="Poker card"
            className="h-16 w-12 object-contain"
            draggable={false}
          />
        </div>
        <div
          className="animate-float absolute bottom-40 right-1/4 hidden opacity-60 lg:block"
          style={{ animationDelay: "1.2s" }}
        >
          <div className="h-14 w-14 rounded-full border-4 border-black bg-[var(--accent)] pixel-border" />
        </div>

        <h1 className="font-retro-display glow-text mb-6 text-5xl leading-tight tracking-tight text-white md:text-7xl">
          POKER
          <br />
          <span className="text-[var(--secondary)]">STARKS</span>
        </h1>

        <p className="font-retro-display neon-magenta-text mb-10 text-xs uppercase tracking-[0.28em] text-[var(--primary)] md:text-sm">
          ZK-POWERED POKER ON STARKNET
        </p>

        <div className="mb-14 flex flex-col gap-6 md:flex-row">
          <Link
            href="/lobby"
            className="group relative px-10 py-4 font-retro-display text-xs brand-btn-cyan"
          >
            ENTER LOBBY
            <span className="pointer-events-none absolute -inset-1 border-2 border-white/50 opacity-0 transition-opacity group-hover:opacity-30" />
          </Link>
          <a
            href="#how-it-works"
            className="px-10 py-4 font-retro-display text-xs brand-btn-magenta"
          >
            HOW IT WORKS
          </a>
        </div>

        <div className="w-full max-w-4xl px-4">
          <div className="border-4 border-black bg-[#1a1a2e] p-2 pixel-border">
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-[#0f3460]">
              <div className="absolute inset-0 bg-[radial-gradient(circle,_#16213e_0%,_#0f3460_100%)]" />
              <div className="relative z-10 flex h-full w-full flex-col justify-between p-8">
                <div className="flex items-start justify-between">
                  <div className="border-2 border-[var(--secondary)]/40 bg-black/50 p-2 font-retro-display text-[9px] text-[var(--secondary)]">
                    PREVIEW SCENE
                  </div>
                  <div className="flex gap-2">
                    <div className="h-16 w-12 border-2 border-black bg-white pixel-border-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/retro/cards/front/hearts_A.png"
                        alt="Ace hearts"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="h-16 w-12 border-2 border-black bg-white pixel-border-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/retro/cards/front/spades_K.png"
                        alt="King spades"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </div>

                <div className="animate-pulse font-retro-display text-[10px] text-white/80">
                  WAITING FOR PLAYERS...
                </div>

                <div className="flex justify-center gap-8">
                  {[
                    ["PLAYER_1", "👾", "border-[var(--primary)]/50 bg-black"],
                    ["YOU", "😎", "border-[var(--secondary)] bg-[var(--secondary)]/10"],
                    ["BOT_ALPHA", "🤖", "border-[var(--primary)]/50 bg-black"],
                  ].map(([name, avatar, style]) => (
                    <div key={name} className="flex flex-col items-center gap-2">
                      <div
                        className={`flex h-14 w-14 items-center justify-center border-4 bg-slate-800 ${style}`}
                      >
                        <span className="text-2xl">{avatar}</span>
                      </div>
                      <span
                        className={`px-2 py-1 font-retro-display text-[9px] ${
                          name === "YOU"
                            ? "bg-[var(--secondary)] text-black"
                            : "bg-black text-white"
                        }`}
                      >
                        {name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between px-2 font-retro-display text-[9px] uppercase text-white/50">
              <span>Real Data in Lobby</span>
              <span>On-Chain Tables</span>
              <span>Protocol v0.4.2</span>
            </div>
          </div>
        </div>
      </main>

      <section
        id="how-it-works"
        className="relative overflow-hidden bg-black/35 py-20"
      >
        <div className="relative z-10 mx-auto max-w-7xl px-8">
          <h2 className="mb-16 text-center font-retro-display text-xl text-white">
            3 STEPS TO WIN
          </h2>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              ["1", "🔌", "CONNECT", "Link your wallet and keep your game flow on-chain."],
              ["2", "🃏", "JOIN LOBBY", "Pick a table by stakes and player count."],
              ["3", "💰", "PLAY & WIN", "Use skill, read opponents, and stack chips."],
            ].map(([idx, icon, title, desc]) => (
              <div key={idx} className="flex flex-col items-center text-center">
                <div className="relative mb-7 flex h-24 w-24 items-center justify-center border-4 border-[var(--secondary)] bg-[var(--secondary)]/10">
                  <span className="text-5xl">{icon}</span>
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
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(#00f3ff 1px, transparent 1px), linear-gradient(90deg, #00f3ff 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        />
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
    </div>
  );
}
