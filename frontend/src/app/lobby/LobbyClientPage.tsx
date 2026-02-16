"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStarknet } from "@/providers/StarknetProvider";
import { useLobby } from "@/hooks/useLobby";
import BrandWordmark from "@/components/brand/BrandWordmark";

const ROOM_NAMES = [
  "NEON VOID",
  "CYBER GULCH",
  "RETRO ROOM",
  "WHALE TANK",
  "BYTE CASINO",
  "ZERO KNOWLEDGE",
];

const ROOM_BACKGROUNDS = [
  "bg-[linear-gradient(180deg,#1d4d21_0%,#162f18_100%)]",
  "bg-[linear-gradient(180deg,#2f2868_0%,#1a1645_100%)]",
  "bg-[linear-gradient(180deg,#3b1e6f_0%,#22123f_100%)]",
  "bg-[linear-gradient(180deg,#6f3a11_0%,#3f210b_100%)]",
  "bg-[linear-gradient(180deg,#0e4f66_0%,#092f3d_100%)]",
  "bg-[linear-gradient(180deg,#4f0e3a_0%,#2d0821_100%)]",
];

export default function LobbyPage() {
  const {
    address,
    isConnected,
    connecting,
    connect,
    disconnect,
    error: walletError,
  } = useStarknet();
  const { tables, loading, error: lobbyError, createTable } = useLobby();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    maxPlayers: "6",
    smallBlind: "5",
    bigBlind: "10",
    minBuyIn: "100",
    maxBuyIn: "1000",
  });

  const walletLabel = useMemo(() => {
    if (!address) return "NOT CONNECTED";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  const totalPlayers = useMemo(
    () => tables.reduce((sum, table) => sum + table.playerCount, 0),
    [tables],
  );

  const handleCreate = async () => {
    try {
      setCreateError(null);
      await createTable({
        maxPlayers: Math.max(2, Math.min(6, Number(createForm.maxPlayers) || 6)),
        smallBlind: BigInt(createForm.smallBlind || "0"),
        bigBlind: BigInt(createForm.bigBlind || "0"),
        minBuyIn: BigInt(createForm.minBuyIn || "0"),
        maxBuyIn: BigInt(createForm.maxBuyIn || "0"),
      });
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Table creation failed.");
    }
  };

  const closeCreate = () => setShowCreate(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-transparent text-slate-100 font-retro-body">
      <header className="relative z-20 mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-7xl items-center justify-between rounded-sm px-6 py-4 brand-topbar">
        <div className="flex items-center gap-4">
          <BrandWordmark href="/" subtitle="GAME LOBBY" />
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden flex-col items-end md:flex">
            <span className="font-retro-display text-[9px] text-slate-400">
              WALLET STATUS
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 ${isConnected ? "bg-green-500" : "bg-slate-500"} ${
                  isConnected ? "animate-pulse" : ""
                }`}
              />
              <span className="font-retro-display text-[10px]">{walletLabel}</span>
            </div>
          </div>
          <button
            onClick={isConnected ? disconnect : connect}
            disabled={connecting}
            className="flex items-center gap-2 px-5 py-3 font-retro-display text-[10px] brand-btn-magenta disabled:opacity-50"
          >
            {connecting
              ? "CONNECTING..."
              : isConnected
                ? "DISCONNECT"
                : "CONNECT WALLET"}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl p-8 pb-24">
        {(walletError || lobbyError || createError) && (
          <div className="mb-6 border-l-4 border-red-500 bg-red-500/10 p-4 font-retro-display text-[10px] text-red-200">
            {createError || lobbyError || walletError}
          </div>
        )}

        <div className="mb-10 flex flex-col items-end justify-between gap-6 md:flex-row">
          <div>
            <h2 className="font-retro-display text-xl text-white">GAME LOBBY</h2>
            <div className="mt-3 flex gap-4">
              <span className="border-b-4 border-[var(--primary)] pb-1 font-retro-display text-[9px] text-[var(--primary)]">
                ALL TABLES
              </span>
              <span className="pb-1 font-retro-display text-[9px] text-slate-500">
                TOURNAMENTS (SOON)
              </span>
              <span className="pb-1 font-retro-display text-[9px] text-slate-500">
                MY GAMES (SOON)
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="group flex items-center gap-3 px-8 py-4 font-retro-display text-xs brand-btn-cyan"
          >
            <span className="transition-transform group-hover:rotate-90">+</span>
            CREATE TABLE
          </button>
        </div>

        {loading ? (
          <div className="bg-black/60 p-10 text-center font-retro-display text-xs text-slate-300 pixel-border border-black">
            LOADING TABLES...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tables.map((table, idx) => {
              const isWaiting = table.state === "Waiting";
              const roomName = ROOM_NAMES[idx % ROOM_NAMES.length];
              const roomBackground = ROOM_BACKGROUNDS[idx % ROOM_BACKGROUNDS.length];
              return (
                <div key={table.tableId} className="group relative pt-8">
                  <div
                    className={`absolute -top-4 left-1/2 z-10 -translate-x-1/2 px-3 py-1 font-retro-display text-[9px] text-white pixel-border ${
                      isWaiting ? "bg-green-500" : "bg-red-500"
                    }`}
                  >
                    {isWaiting ? "WAITING" : "IN PROGRESS"}
                  </div>

                  <div className="cabinet-shape relative bg-slate-800 p-1 shadow-2xl border-x-8 border-t-8 border-slate-700 group-hover:border-[var(--primary)] transition-colors">
                    <div
                      className={`mb-4 h-40 w-full ${roomBackground} relative flex flex-col items-center justify-center overflow-hidden`}
                    >
                      <div className="absolute inset-0 opacity-20 [background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.06)_0px,rgba(255,255,255,0.06)_2px,transparent_2px,transparent_7px)]" />
                      <div className="mb-2 text-4xl opacity-50">🕹️</div>
                      <div className="z-10 font-retro-display text-[10px] text-white">
                        {roomName}
                      </div>
                    </div>

                    <div className="space-y-2 px-4 pb-4 font-retro-display text-[9px]">
                      <div className="flex justify-between text-slate-400">
                        <span>BLINDS:</span>
                        <span className="text-[var(--secondary)]">
                          {Number(table.smallBlind)}/{Number(table.bigBlind)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>PLAYERS:</span>
                        <span className="text-white">
                          {table.playerCount}/{table.maxPlayers}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>MIN BUY-IN:</span>
                        <span className="text-white">{Number(table.minBuyIn)}</span>
                      </div>

                      {isWaiting ? (
                        <Link
                          href={`/table/${table.tableId}`}
                          className="mt-3 block w-full bg-[var(--primary)] py-3 text-center font-retro-display text-[10px] text-white pixel-border transition-transform hover:scale-[1.03] active:scale-[0.98]"
                        >
                          JOIN GAME
                        </Link>
                      ) : (
                        <Link
                          href={`/spectate/${table.tableId}`}
                          className="mt-3 block w-full bg-slate-600 py-3 text-center font-retro-display text-[10px] text-slate-100 pixel-border transition-colors hover:bg-slate-500"
                        >
                          SPECTATE
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {tables.length === 0 && (
              <div className="col-span-full bg-black/60 p-10 text-center font-retro-display text-xs text-slate-300 pixel-border border-black">
                NO TABLES YET. CREATE THE FIRST TABLE.
              </div>
            )}
          </div>
        )}
      </main>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={closeCreate}
        >
          <div
            className="relative w-full max-w-md p-8 text-white pixel-border-primary brand-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeCreate}
              className="absolute right-4 top-4 font-retro-display text-xs text-slate-400 transition-colors hover:text-[var(--primary)]"
            >
              X
            </button>

            <h3 className="mb-8 font-retro-display text-sm text-[var(--primary)] pixel-text-shadow">
              INITIALIZE TABLE
            </h3>

            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreate();
              }}
            >
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="mb-2 block font-retro-display text-[9px] text-slate-300">
                    MAX PLAYERS
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={6}
                    value={createForm.maxPlayers}
                    onChange={(e) => setCreateForm({ ...createForm, maxPlayers: e.target.value })}
                    className="w-full border-4 border-black bg-slate-900 px-3 py-3 font-retro-display text-sm text-white outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-retro-display text-[9px] text-slate-300">
                    SMALL BLIND
                  </label>
                  <input
                    type="number"
                    value={createForm.smallBlind}
                    onChange={(e) => setCreateForm({ ...createForm, smallBlind: e.target.value })}
                    className="w-full border-4 border-black bg-slate-900 px-3 py-3 font-retro-display text-sm text-white outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-retro-display text-[9px] text-slate-300">
                    BIG BLIND
                  </label>
                  <input
                    type="number"
                    value={createForm.bigBlind}
                    onChange={(e) => setCreateForm({ ...createForm, bigBlind: e.target.value })}
                    className="w-full border-4 border-black bg-slate-900 px-3 py-3 font-retro-display text-sm text-white outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-retro-display text-[9px] text-slate-300">
                    MIN BUY-IN
                  </label>
                  <input
                    type="number"
                    value={createForm.minBuyIn}
                    onChange={(e) => setCreateForm({ ...createForm, minBuyIn: e.target.value })}
                    className="w-full border-4 border-black bg-slate-900 px-3 py-3 font-retro-display text-sm text-white outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block font-retro-display text-[9px] text-slate-300">
                  MAX BUY-IN
                </label>
                <input
                  type="number"
                  value={createForm.maxBuyIn}
                  onChange={(e) => setCreateForm({ ...createForm, maxBuyIn: e.target.value })}
                  className="w-full border-4 border-black bg-slate-900 px-3 py-3 font-retro-display text-sm text-white outline-none focus:border-[var(--primary)]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 font-retro-display text-xs brand-btn-cyan"
              >
                LAUNCH TABLE
              </button>
            </form>
          </div>
        </div>
      )}

      <footer className="fixed bottom-3 left-4 right-4 z-30 flex items-center justify-between rounded-sm px-6 py-2 font-retro-display text-[9px] text-white brand-topbar">
        <div className="flex gap-6">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {tables.length} TABLES LIVE
          </span>
          <span className="text-slate-300">NETWORK: STARKNET</span>
        </div>
        <div className="flex gap-4">
          <span className="text-[var(--secondary)]">{totalPlayers} PLAYERS SEATED</span>
          <Link href="/" className="text-[var(--primary)] hover:underline">
            HOME
          </Link>
        </div>
      </footer>
    </div>
  );
}
