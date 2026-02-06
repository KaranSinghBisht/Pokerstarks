"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PokerTable from "@/components/poker/PokerTable";
import { useGame } from "@/hooks/useGame";
import { usePokerActions } from "@/hooks/usePokerActions";
import { PlayerAction } from "@/lib/constants";

export default function TablePage() {
  const params = useParams();
  const tableId = Number(params.id);

  const { table, seats, hand, playerHands, communityCards, loading } =
    useGame(tableId);
  const { submitAction, setReady, joinTable } = usePokerActions(tableId);

  // TODO: Replace with actual wallet address from Cartridge Controller
  const [localAddress] = useState<string>("");

  const handleAction = useCallback(
    (action: PlayerAction, amount: bigint) => {
      if (!hand) return;
      submitAction(hand.handId, action, amount);
    },
    [hand, submitAction],
  );

  const handleReady = useCallback(() => {
    setReady();
  }, [setReady]);

  const handleJoin = useCallback(
    (seatIndex: number, buyIn: bigint) => {
      joinTable(seatIndex, buyIn);
    },
    [joinTable],
  );

  if (loading || !table) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400">Loading table...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              &larr; Lobby
            </Link>
            <h1 className="text-lg font-bold text-amber-400">
              Table #{tableId}
            </h1>
            <span className="text-xs text-gray-500">
              Blinds: {Number(table.smallBlind)}/{Number(table.bigBlind)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {table.playerCount}/{table.maxPlayers} players
            </span>
            <span
              className={`text-xs px-2 py-1 rounded ${
                table.state === "Waiting"
                  ? "bg-green-900/50 text-green-400"
                  : table.state === "InProgress"
                    ? "bg-amber-900/50 text-amber-400"
                    : "bg-gray-900/50 text-gray-400"
              }`}
            >
              {table.state}
            </span>
          </div>
        </div>
      </header>

      {/* Table area */}
      <main className="max-w-5xl mx-auto px-6 py-12">
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
        />
      </main>
    </div>
  );
}
