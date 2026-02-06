"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import PokerTable from "@/components/poker/PokerTable";
import ChatPanel from "@/components/poker/ChatPanel";
import { useGame } from "@/hooks/useGame";
import { PlayerAction } from "@/lib/constants";

export default function SpectatePage() {
  const params = useParams();
  const tableId = Number(params.id);

  const { table, seats, hand, playerHands, communityCards, loading } =
    useGame(tableId);

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
            <span className="text-xs bg-purple-900/50 text-purple-400 px-2 py-1 rounded">
              Spectating
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {table.playerCount}/{table.maxPlayers} players
            </span>
            <Link
              href={`/table/${tableId}`}
              className="px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-500 font-medium transition-colors"
            >
              Join Table
            </Link>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="max-w-6xl mx-auto px-6 py-8 flex gap-6">
        {/* Table - takes most space */}
        <div className="flex-1">
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
        </div>

        {/* Chat sidebar */}
        <div className="w-72 h-[500px]">
          <ChatPanel tableId={tableId} />
        </div>
      </main>
    </div>
  );
}
