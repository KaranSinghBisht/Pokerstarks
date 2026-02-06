"use client";

import { useState } from "react";
import Link from "next/link";
import { useStarknet } from "@/providers/StarknetProvider";
import { useLobby } from "@/hooks/useLobby";

export default function Lobby() {
  const { address, isConnected, connecting, connect, disconnect } =
    useStarknet();
  const { tables, loading, createTable } = useLobby();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    maxPlayers: "6",
    smallBlind: "5",
    bigBlind: "10",
    minBuyIn: "100",
    maxBuyIn: "1000",
  });

  const handleCreate = () => {
    createTable({
      maxPlayers: parseInt(createForm.maxPlayers),
      smallBlind: BigInt(createForm.smallBlind),
      bigBlind: BigInt(createForm.bigBlind),
      minBuyIn: BigInt(createForm.minBuyIn),
      maxBuyIn: BigInt(createForm.maxBuyIn),
    });
    setShowCreate(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
              Pokerstarks
            </h1>
            <span className="text-xs text-gray-500 border border-gray-700 px-2 py-0.5 rounded">
              ZK Poker on Starknet
            </span>
          </div>
          {isConnected ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button
                onClick={disconnect}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-medium transition-colors text-sm"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 font-medium transition-colors text-sm disabled:opacity-50"
            >
              {connecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Create table section */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Tables</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 font-medium transition-colors text-sm"
          >
            + Create Table
          </button>
        </div>

        {/* Create table form */}
        {showCreate && (
          <div className="mb-6 p-6 rounded-xl bg-gray-900 border border-gray-800">
            <h3 className="text-lg font-medium mb-4">Create New Table</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Max Players</label>
                <input
                  type="number"
                  value={createForm.maxPlayers}
                  onChange={(e) => setCreateForm({ ...createForm, maxPlayers: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm"
                  min={2}
                  max={6}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Small Blind</label>
                <input
                  type="number"
                  value={createForm.smallBlind}
                  onChange={(e) => setCreateForm({ ...createForm, smallBlind: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Big Blind</label>
                <input
                  type="number"
                  value={createForm.bigBlind}
                  onChange={(e) => setCreateForm({ ...createForm, bigBlind: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Min Buy-In</label>
                <input
                  type="number"
                  value={createForm.minBuyIn}
                  onChange={(e) => setCreateForm({ ...createForm, minBuyIn: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Max Buy-In</label>
                <input
                  type="number"
                  value={createForm.maxBuyIn}
                  onChange={(e) => setCreateForm({ ...createForm, maxBuyIn: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              className="mt-4 px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 font-medium transition-colors text-sm"
            >
              Create Table
            </button>
          </div>
        )}

        {/* Tables list */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading tables...</div>
        ) : (
          <div className="space-y-3">
            {tables.map((table) => (
              <Link
                key={table.tableId}
                href={`/table/${table.tableId}`}
                className="block p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <span className="text-gray-400 text-sm">#{table.tableId}</span>
                    <span className="font-medium">
                      {table.playerCount}/{table.maxPlayers} Players
                    </span>
                    <span className="text-amber-400 text-sm">
                      Blinds: {Number(table.smallBlind)}/{Number(table.bigBlind)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        table.state === "Waiting"
                          ? "bg-green-900/50 text-green-400"
                          : "bg-amber-900/50 text-amber-400"
                      }`}
                    >
                      {table.state}
                    </span>
                    <span className="text-gray-400 text-sm">Join &rarr;</span>
                  </div>
                </div>
              </Link>
            ))}

            {tables.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No tables available. Create one to get started!
              </div>
            )}
          </div>
        )}

        {/* Info section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-gray-900 border border-gray-800">
            <h3 className="font-medium text-amber-400 mb-2">Provably Fair</h3>
            <p className="text-sm text-gray-400">
              Every shuffle is proven with ZK proofs (Noir + Garaga). No one can cheat the deck.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-gray-900 border border-gray-800">
            <h3 className="font-medium text-amber-400 mb-2">Encrypted Cards</h3>
            <p className="text-sm text-gray-400">
              ElGamal encryption on Grumpkin curve ensures no one sees your cards until showdown.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-gray-900 border border-gray-800">
            <h3 className="font-medium text-amber-400 mb-2">Fully On-Chain</h3>
            <p className="text-sm text-gray-400">
              Game state stored on Starknet via Dojo ECS. Verifiable, transparent, unstoppable.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
