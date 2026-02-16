"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PokerTable from "@/components/poker/PokerTable";
import { useGame } from "@/hooks/useGame";
import { PlayerAction } from "@/lib/constants";
import BrandWordmark from "@/components/brand/BrandWordmark";

export default function SpectatePage() {
  const params = useParams();
  const tableId = Number(params.id);

  const { table, seats, hand, playerHands, communityCards, loading, error } =
    useGame(tableId);

  const particleStyles = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => ({
        left: `${(i * 7 + 13) % 100}vw`,
        animationDuration: `${5 + (i % 5)}s`,
        animationDelay: `${(i % 6) * 0.8}s`,
        opacity: 0.08 + (i % 3) * 0.07,
      })),
    [],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin border-2 border-[var(--accent)] border-t-transparent" />
          <span className="font-retro-display text-xs text-slate-400">
            LOADING SPECTATOR MODE...
          </span>
        </div>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-white">
        <div className="max-w-xl border-l-4 border-red-500 bg-red-500/10 p-5 font-retro-display text-[10px] text-red-200">
          {error || `Table #${tableId} was not found or indexer data is unavailable.`}
          <div className="mt-4">
            <Link href="/lobby" className="text-[var(--secondary)] hover:underline">
              Return to Lobby
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent font-retro-body text-white">
      <main className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden p-4 md:p-8">
        <nav className="absolute left-4 right-4 top-4 z-30 flex items-center justify-between rounded-sm p-4 brand-topbar">
          <div className="flex items-center space-x-4">
            <BrandWordmark href="/" subtitle="SPECTATOR MODE" compact />
            <div className="hidden brand-panel px-3 py-1 font-retro-display text-[9px] text-white md:block">
              TABLE: <span className="text-[var(--secondary)]">#{tableId}</span>
            </div>
          </div>

          <div className="flex items-center space-x-4 md:space-x-6">
            <div className="text-right">
              <p className="font-retro-display text-[8px] uppercase text-white/60">
                Players Seated
              </p>
              <p className="font-retro-display text-sm text-[var(--secondary)]">
                {table.playerCount}/{table.maxPlayers}
              </p>
            </div>
            <Link
              href="/lobby"
              className="px-3 py-2 font-retro-display text-[9px] brand-btn-magenta"
            >
              EXIT
            </Link>
          </div>
        </nav>

        <div className="relative mt-14 w-full max-w-6xl">
          <PokerTable
            table={table}
            seats={seats}
            hand={hand}
            playerHands={playerHands}
            communityCards={communityCards}
            localPlayerAddress={undefined}
            onAction={(_action: PlayerAction, _amount: bigint) => {}}
            onReady={() => {}}
            onJoin={() => {}}
          />

          <Link
            href={`/table/${tableId}`}
            className="absolute right-[16%] top-1/2 z-30 -translate-y-1/2 translate-x-1/2 px-6 py-4 font-retro-display text-[10px] brand-btn-cyan"
          >
            JOIN TABLE
          </Link>

          <div className="absolute left-4 top-8 hidden w-64 p-4 text-xs brand-panel md:block">
            <div className="mb-3 flex items-center justify-between border-b border-white/20 pb-1">
              <span className="font-retro-display text-[8px] text-[var(--secondary)]">
                ZK ENGINE
              </span>
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center text-green-400">
                <span className="mr-2">●</span>
                <span>Hand masking generated</span>
              </div>
              <div className="flex items-center text-green-400">
                <span className="mr-2">●</span>
                <span>Shuffle permutation verified</span>
              </div>
              <div className="flex items-center animate-pulse text-[var(--secondary)]">
                <span className="mr-2">◌</span>
                <span>Waiting for verifier node...</span>
              </div>
              <div className="pl-4 text-white/30">Commitment stream active</div>
            </div>
          </div>

          <div className="absolute right-4 top-8 hidden w-64 p-4 text-xs brand-panel md:block">
            <div className="mb-3 border-b border-white/20 pb-1 text-[var(--primary)]">
              <span className="font-retro-display text-[8px]">TABLE STATS</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-white/60">Current Pot:</span>
                <span>{Number(hand?.pot ?? 0n)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Blinds:</span>
                <span>
                  {Number(table.smallBlind)}/{Number(table.bigBlind)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Active:</span>
                <span>{hand?.activePlayers ?? table.playerCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Phase:</span>
                <span>{hand?.phase || "Waiting"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full">
          <div className="relative flex items-center justify-center overflow-hidden bg-[var(--primary)] py-4">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background:
                  "repeating-linear-gradient(45deg, transparent, transparent 10px, black 10px, black 20px)",
              }}
            />
            <div className="relative flex items-center space-x-8 animate-pulse">
              <span className="font-retro-display text-lg italic tracking-widest text-black">
                SPECTATING
              </span>
              <span className="text-xl text-black">◉</span>
              <span className="font-retro-display text-lg italic tracking-widest text-black">
                SPECTATING
              </span>
              <span className="text-xl text-black">◉</span>
              <span className="font-retro-display text-lg italic tracking-widest text-black">
                SPECTATING
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-black/90 p-3 font-retro-display text-[9px] tracking-tight text-white/60">
            <div className="flex space-x-6">
              <span>TABLE: #{tableId}</span>
              <span className="text-green-500">HAND: #{hand?.handId ?? 0}</span>
            </div>
            <div className="flex space-x-4 uppercase">
              <span className="text-white/40">How to play (soon)</span>
              <span className="text-white/40">Provably fair (soon)</span>
              <Link
                href="/lobby"
                className="transition-colors hover:text-[var(--primary)]"
              >
                Exit Lobby
              </Link>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 z-0">
          {particleStyles.map((style, idx) => (
            <div key={idx} className="coin-particle" style={style} />
          ))}
        </div>
      </main>
    </div>
  );
}
