"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import PokerTable from "@/components/poker/PokerTable";
import ChatPanel from "@/components/poker/ChatPanel";
import TongoWallet from "@/components/poker/TongoWallet";
import { useGameOrchestrator } from "@/hooks/useGameOrchestrator";
import { useStarknet } from "@/providers/StarknetProvider";
import { useTongo } from "@/hooks/useTongo";
import { useChipToken } from "@/hooks/useChipToken";
import { usePrivateBuyIn } from "@/hooks/usePrivateBuyIn";
import { usePrivateCashout } from "@/hooks/usePrivateCashout";
import { PlayerAction, STRK_TOKEN_ADDRESS } from "@/lib/constants";
import BrandWordmark from "@/components/brand/BrandWordmark";
import WalletSelector from "@/components/ui/WalletSelector";
import WalletWarning from "@/components/ui/WalletWarning";

export default function TablePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const isSolo = searchParams.get("solo") === "true";
  const tableId = Number(params.id);
  const { address, account, isConnected, connect, walletSource, error: walletError } = useStarknet();
  const [showWalletSelector, setShowWalletSelector] = useState(false);
  const tongo = useTongo(address, account);
  const chip = useChipToken(address, account);
  const privateBuyIn = usePrivateBuyIn(tongo, account ?? null, address ?? null);
  const privateCashout = usePrivateCashout(tongo);
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
    sidePots,
    actions,
  } = useGameOrchestrator(tableId);

  // Normalize wallet address to match Torii format (no leading zeros, lowercase)
  const localAddress = address
    ? "0x" + address.slice(2).replace(/^0+/, "").toLowerCase()
    : "";
  const [fillingBots, setFillingBots] = useState(false);

  const isHost =
    !!table &&
    !!localAddress &&
    table.creator.toLowerCase() === localAddress.toLowerCase();

  // Detect privacy table (STRK token)
  const isPrivacyTable = !!table && (() => {
    try {
      const strk = "0x" + STRK_TOKEN_ADDRESS.slice(2).replace(/^0+/, "").toLowerCase();
      const tbl = "0x" + table.tokenAddress.slice(2).replace(/^0+/, "").toLowerCase();
      return tbl === strk;
    } catch {
      return false;
    }
  })();

  const handleFillWithBots = useCallback(async () => {
    if (!table) return;
    setFillingBots(true);
    setActionError(null);
    try {
      const res = await fetch("/api/bot/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: table.tableId }),
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to fill with bots.",
      );
    } finally {
      setFillingBots(false);
    }
  }, [table]);

  // ─── Solo mode automation ───
  // When navigated with ?solo=true, auto-join → fill bots → ready
  const soloStepRef = useRef<"join" | "fill" | "ready" | "done">(
    isSolo ? "join" : "done",
  );

  useEffect(() => {
    if (!isSolo || !table || !localAddress || loading) return;
    const step = soloStepRef.current;

    const localSeat = seats.find(
      (s) => s.isOccupied && s.player.toLowerCase() === localAddress.toLowerCase(),
    );

    if (step === "join" && !localSeat && table.state === "Waiting") {
      soloStepRef.current = "fill"; // advance immediately to avoid re-trigger
      actions.joinTable(0, table.minBuyIn, "0", table.tokenAddress).catch((err) => {
        setActionError(err instanceof Error ? err.message : "Solo join failed.");
        soloStepRef.current = "done";
      });
      return;
    }

    if ((step === "join" || step === "fill") && localSeat && table.state === "Waiting") {
      soloStepRef.current = "ready"; // advance
      setFillingBots(true);
      fetch("/api/bot/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: table.tableId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setActionError(data.error);
        })
        .catch((err) => {
          setActionError(err instanceof Error ? err.message : "Bot fill failed.");
        })
        .finally(() => setFillingBots(false));
      return;
    }

    if (step === "ready" && localSeat && !localSeat.isReady && table.state === "Waiting") {
      soloStepRef.current = "done";
      // Small delay to let bots join first
      const timer = setTimeout(() => {
        actions.setReady().catch((err) => {
          setActionError(err instanceof Error ? err.message : "Auto-ready failed.");
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSolo, table, seats, localAddress, loading, actions, setActionError]);

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
      actions.joinTable(seatIndex, buyIn, "0", table?.tokenAddress).catch((err) => {
        setActionError(err instanceof Error ? err.message : "Join action failed.");
      });
    },
    [actions, table?.tokenAddress],
  );

  const handlePrivateJoin = useCallback(
    (seatIndex: number, buyIn: bigint) => {
      setActionError(null);
      privateBuyIn.privateBuyIn(tableId, seatIndex, buyIn, "0").catch((err) => {
        setActionError(err instanceof Error ? err.message : "Private buy-in failed.");
      });
    },
    [privateBuyIn, tableId],
  );

  const handlePrivateCashout = useCallback(() => {
    if (!table) return;
    const localSeat = seats.find(
      (s) => s.isOccupied && s.player.toLowerCase() === localAddress.toLowerCase(),
    );
    if (!localSeat) return;
    setActionError(null);
    privateCashout.privateCashout(tableId, localSeat.chips, async () => {
      await actions.leaveTable();
    }).catch((err) => {
      setActionError(err instanceof Error ? err.message : "Private cashout failed.");
    });
  }, [table, seats, localAddress, privateCashout, tableId, actions]);

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
    <div className="min-h-screen overflow-hidden bg-black text-white font-retro-body relative">
      <div className="retro-grid-container fixed inset-0 z-0 opacity-20">
        <div className="retro-grid" />
      </div>
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
          {chip.isConfigured && (
            <div className="text-center brand-panel px-3 py-1">
              <div className="font-retro-display text-[8px] text-slate-400">MY CHIP</div>
              <div className="font-retro-display text-sm text-[var(--secondary)] md:text-base">
                {chip.balance !== null ? Number(chip.balance).toLocaleString() : "..."}
              </div>
            </div>
          )}
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
              onClick={() => setShowWalletSelector(true)}
              className="px-3 py-2 font-retro-display text-[8px] brand-btn-magenta"
            >
              CONNECT
            </button>
          )}
        </div>
      </header>

      {walletSource === "starkzap" && <WalletWarning />}

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
            onJoin={isPrivacyTable && tongo.isAvailable && tongo.balance !== null && tongo.balance > 0n
              ? handlePrivateJoin
              : handleJoin}
            myHoleCards={myHoleCards}
            isProving={isProving}
            provingProgress={provingProgress}
            isHost={isHost}
            onFillWithBots={handleFillWithBots}
            fillingBots={fillingBots}
            isPrivacyMode={isPrivacyTable}
            sidePots={sidePots}
          />
        </div>

        <aside className="hidden w-80 flex-col gap-2 p-2 lg:flex">
          <div className="w-full overflow-hidden rounded-sm brand-panel">
            <TongoWallet tongo={tongo} walletAddress={localAddress} />
          </div>

          {/* Private Buy-In Progress */}
          {privateBuyIn.loading && (
            <div className="w-full border-l-4 border-purple-500 bg-purple-900/20 p-3 font-retro-display text-[9px] text-purple-200">
              <div className="text-[10px] text-purple-300 mb-2">PRIVATE BUY-IN</div>
              <div className="space-y-1">
                <div className={privateBuyIn.step === "withdrawing" ? "text-purple-300" : "text-green-400"}>
                  {privateBuyIn.step === "withdrawing" ? ">> UNSHIELDING STRK..." : "UNSHIELDED"}
                </div>
                <div className={privateBuyIn.step === "joining" ? "text-purple-300" : "text-slate-500"}>
                  {privateBuyIn.step === "joining" ? ">> JOINING TABLE..." : "JOINING TABLE"}
                </div>
              </div>
            </div>
          )}

          {/* Private Cashout Progress */}
          {privateCashout.loading && (
            <div className="w-full border-l-4 border-purple-500 bg-purple-900/20 p-3 font-retro-display text-[9px] text-purple-200">
              <div className="text-[10px] text-purple-300 mb-2">SHIELD WINNINGS</div>
              <div className="space-y-1">
                <div className={privateCashout.step === "cashing-out" ? "text-purple-300" : "text-green-400"}>
                  {privateCashout.step === "cashing-out" ? ">> LEAVING TABLE..." : "LEFT TABLE"}
                </div>
                <div className={privateCashout.step === "shielding" ? "text-purple-300" : "text-slate-500"}>
                  {privateCashout.step === "shielding" ? ">> SHIELDING STRK..." : "SHIELDING STRK"}
                </div>
              </div>
            </div>
          )}

          {/* Leave & Shield Button */}
          {isPrivacyTable &&
            tongo.isAvailable &&
            table.state === "Waiting" &&
            seats.some(
              (s) => s.isOccupied && s.player.toLowerCase() === localAddress.toLowerCase(),
            ) &&
            !privateCashout.loading && (
              <button
                onClick={handlePrivateCashout}
                className="w-full bg-purple-700 py-3 font-retro-display text-[10px] text-white pixel-border-sm transition-colors hover:bg-purple-600"
              >
                LEAVE &amp; SHIELD
              </button>
            )}

          {(privateBuyIn.error || privateCashout.error) && (
            <div className="w-full border-l-4 border-red-500 bg-red-500/10 p-3 font-retro-display text-[8px] text-red-200">
              {privateBuyIn.error || privateCashout.error}
            </div>
          )}

          <div className="min-h-0 w-full flex-1 overflow-hidden rounded-sm brand-panel">
            <ChatPanel tableId={tableId} />
          </div>
        </aside>
      </main>

      {showWalletSelector && (
        <WalletSelector onClose={() => setShowWalletSelector(false)} />
      )}
    </div>
  );
}
