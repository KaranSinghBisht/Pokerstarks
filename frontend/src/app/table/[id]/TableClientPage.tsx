"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PokerTable from "@/components/poker/PokerTable";
import ChatPanel from "@/components/poker/ChatPanel";
import { useGameOrchestrator } from "@/hooks/useGameOrchestrator";
import { useStarknet } from "@/providers/StarknetProvider";
import { PlayerAction } from "@/lib/constants";
import BrandWordmark from "@/components/brand/BrandWordmark";

export default function TablePage() {
  const params = useParams();
  const tableId = Number(params.id);
  const { address, isConnected, connect, error: walletError } = useStarknet();
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    table,
    seats,
    hand,
    playerHands,
    communityCards,
    loading,
    error,
    myHoleCards,
    isProving,
    provingProgress,
    actions,
  } = useGameOrchestrator(tableId);

  const localAddress = address || "";

  const handleAction = useCallback(
    (action: PlayerAction, amount: bigint) => {
      if (!hand) return;
      setActionError(null);
      actions.submitAction(hand.handId, action, amount).catch((err) => {
        setActionError(err instanceof Error ? err.message : "Action failed.");
      });
    },
    [hand, actions],
  );

  const handleReady = useCallback(() => {
    setActionError(null);
    actions.setReady().catch((err) => {
      setActionError(err instanceof Error ? err.message : "Ready action failed.");
    });
  }, [actions]);

  const handleJoin = useCallback(
    (seatIndex: number, buyIn: bigint) => {
      setActionError(null);
      actions.joinTable(seatIndex, buyIn).catch((err) => {
        setActionError(err instanceof Error ? err.message : "Join action failed.");
      });
    },
    [actions],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin border-2 border-[var(--accent)] border-t-transparent" />
          <span className="font-retro-display text-xs text-slate-400">
            LOADING TABLE...
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
    <div className="min-h-screen overflow-hidden bg-transparent text-white font-retro-body">
      <header className="relative z-20 mx-4 mt-4 flex items-center justify-between rounded-sm px-4 py-3 md:px-6 brand-topbar">
        <div className="flex items-center gap-4">
          <Link
            href="/lobby"
            className="font-retro-display text-[9px] brand-link"
          >
            ← LOBBY
          </Link>
          <BrandWordmark href="/" subtitle={`TABLE #${tableId}`} compact />
        </div>

        <div className="flex items-center gap-3 md:gap-8">
          <div className="text-center brand-panel px-3 py-1">
            <div className="font-retro-display text-[8px] text-slate-400">POT SIZE</div>
            <div className="font-retro-display text-sm text-[var(--accent)] md:text-base">
              {Number(hand?.pot ?? 0n)}
            </div>
          </div>
          {(error || actionError || walletError) && (
            <span className="hidden max-w-44 truncate bg-red-500/20 px-2 py-1 font-retro-display text-[8px] text-red-300 md:block">
              {actionError || error || walletError}
            </span>
          )}
          {!isConnected && (
            <button
              onClick={connect}
              className="px-3 py-2 font-retro-display text-[8px] brand-btn-magenta"
            >
              CONNECT
            </button>
          )}
        </div>
      </header>

      <main className="relative flex h-[calc(100vh-108px)]">
        <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden p-3 md:p-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <PokerTable
            table={table}
            seats={seats}
            hand={hand}
            playerHands={playerHands}
            communityCards={communityCards}
            localPlayerAddress={localAddress}
            onAction={handleAction}
            onReady={handleReady}
            onJoin={handleJoin}
            myHoleCards={myHoleCards}
            isProving={isProving}
            provingProgress={provingProgress}
          />
        </div>

        <aside className="hidden w-80 p-2 lg:flex">
          <div className="w-full overflow-hidden rounded-sm brand-panel">
            <ChatPanel tableId={tableId} />
          </div>
        </aside>
      </main>
    </div>
  );
}
