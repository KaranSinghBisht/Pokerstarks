"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStarknet } from "@/providers/StarknetProvider";
import { useLobby } from "@/hooks/useLobby";
import { useTongo } from "@/hooks/useTongo";
import { useChipToken } from "@/hooks/useChipToken";
import {
  STRK_TOKEN_ADDRESS,
  CANONICAL_SHUFFLE_VERIFIER,
  CANONICAL_DECRYPT_VERIFIER,
} from "@/lib/constants";
import TongoWallet from "@/components/poker/TongoWallet";
import BrandWordmark from "@/components/brand/BrandWordmark";

/** Normalize a Starknet hex address to lowercase with no leading zeros after 0x */
function normalizeAddress(addr: string): string {
  if (!addr.startsWith("0x")) return addr.toLowerCase();
  return "0x" + addr.slice(2).replace(/^0+/, "").toLowerCase();
}

/** Check if table uses STRK token (privacy mode) */
function isPrivacyTable(tokenAddress: string): boolean {
  try {
    const normalized = "0x" + STRK_TOKEN_ADDRESS.slice(2).replace(/^0+/, "").toLowerCase();
    const tableNorm = "0x" + tokenAddress.slice(2).replace(/^0+/, "").toLowerCase();
    return tableNorm === normalized;
  } catch {
    return false;
  }
}

/** Check if table uses canonical verifier contracts */
function isTrustedVerifiers(shuffleVerifier: string, decryptVerifier: string): boolean {
  return (
    shuffleVerifier === CANONICAL_SHUFFLE_VERIFIER &&
    decryptVerifier === CANONICAL_DECRYPT_VERIFIER
  );
}

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
  const router = useRouter();
  const {
    address,
    account,
    isConnected,
    connecting,
    connect,
    disconnect,
    error: walletError,
  } = useStarknet();
  const { tables, loading, error: lobbyError, createTable, refresh } = useLobby();
  const tongo = useTongo(address, account);
  const chip = useChipToken(address, account);
  const [showTongoWallet, setShowTongoWallet] = useState(false);
  const autoClaimedRef = useRef(false);

  const [showCreate, setShowCreate] = useState(false);
  const [creatingSolo, setCreatingSolo] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    maxPlayers: "6",
    smallBlind: "5",
    bigBlind: "10",
    minBuyIn: "100",
    maxBuyIn: "1000",
    privacyMode: false,
  });
  const [tableFilter, setTableFilter] = useState<"all" | "private" | "public">("all");

  // Reset auto-claim flag when wallet address changes (disconnect/reconnect)
  useEffect(() => {
    autoClaimedRef.current = false;
  }, [address]);

  // Auto-claim faucet on first connect if CHIP balance is 0
  useEffect(() => {
    if (
      chip.isConfigured &&
      isConnected &&
      chip.balance === 0n &&
      !chip.loading &&
      !chip.claiming &&
      !autoClaimedRef.current
    ) {
      autoClaimedRef.current = true;
      chip.claimFaucet();
    }
  }, [chip.isConfigured, isConnected, chip.balance, chip.loading, chip.claiming, chip.claimFaucet]);

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
      // For privacy mode (STRK, 18 decimals), form values are in human STRK.
      // Convert to wei by multiplying by 1e18.
      // For chip mode (decimals=0), values are raw chip counts.
      const STRK_DECIMALS = 10n ** 18n;
      const toOnChain = (v: string) => {
        const raw = BigInt(v || "0");
        return createForm.privacyMode ? raw * STRK_DECIMALS : raw;
      };
      await createTable({
        maxPlayers: Math.max(2, Math.min(6, Number(createForm.maxPlayers) || 6)),
        smallBlind: toOnChain(createForm.smallBlind),
        bigBlind: toOnChain(createForm.bigBlind),
        minBuyIn: toOnChain(createForm.minBuyIn),
        maxBuyIn: toOnChain(createForm.maxBuyIn),
        ...(createForm.privacyMode ? { tokenAddress: STRK_TOKEN_ADDRESS } : {}),
      });
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Table creation failed.");
    }
  };

  const handlePlaySolo = async () => {
    if (!isConnected || !address) {
      connect();
      return;
    }
    try {
      setCreateError(null);
      setCreatingSolo(true);

      // Snapshot IDs that exist before creation
      const existingIds = new Set(tables.map((t) => t.tableId));

      // Create table with sensible defaults
      await createTable({
        maxPlayers: 3,
        smallBlind: 5n,
        bigBlind: 10n,
        minBuyIn: 100n,
        maxBuyIn: 1000n,
      });

      // Poll for the newly created table by matching creator address.
      // refresh() returns the fresh table list directly, avoiding stale closure issues.
      let newTableId: number | null = null;
      const normalizedAddr = normalizeAddress(address);
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((r) => setTimeout(r, 1200));
        const freshTables = await refresh();
        const match = freshTables.find(
          (t) =>
            !existingIds.has(t.tableId) &&
            normalizeAddress(t.creator) === normalizedAddr,
        );
        if (match) {
          newTableId = match.tableId;
          console.log("[solo] found match! tableId:", newTableId);
          break;
        }
      }

      if (newTableId !== null) {
        router.push(`/table/${newTableId}?solo=true`);
      } else {
        // Fallback: navigate to lobby and let user pick
        setCreateError("Table created but couldn't detect it. Check the lobby.");
      }
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Solo game creation failed.",
      );
    } finally {
      setCreatingSolo(false);
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
          {isConnected && chip.isConfigured && (
            <div className="flex items-center gap-2">
              <div className="px-3 py-2 font-retro-display text-[10px] brand-panel">
                <span className="text-slate-400">CHIP: </span>
                <span className="text-[var(--accent)]">
                  {chip.balance !== null ? Number(chip.balance).toLocaleString() : "..."}
                </span>
              </div>
              {chip.balance === 0n && !chip.claiming && (
                <button
                  onClick={() => chip.claimFaucet()}
                  className="px-3 py-2 font-retro-display text-[10px] brand-btn-cyan animate-pulse"
                >
                  CLAIM CHIPS
                </button>
              )}
              {chip.claiming && (
                <span className="px-3 py-2 font-retro-display text-[10px] text-slate-400">
                  CLAIMING...
                </span>
              )}
            </div>
          )}
          {isConnected && (
            <button
              onClick={() => setShowTongoWallet((v) => !v)}
              className="flex items-center gap-2 px-4 py-3 font-retro-display text-[10px] brand-btn-cyan"
            >
              TONGO WALLET
            </button>
          )}
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
              {(["all", "private", "public"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTableFilter(f)}
                  className={`pb-1 font-retro-display text-[9px] ${
                    tableFilter === f
                      ? "border-b-4 border-[var(--primary)] text-[var(--primary)]"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {f === "all" ? "ALL TABLES" : f === "private" ? "PRIVATE" : "PUBLIC"}
                </button>
              ))}
              <span className="pb-1 font-retro-display text-[9px] text-slate-500">
                TOURNAMENTS (SOON)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePlaySolo}
              disabled={creatingSolo}
              className="group flex items-center gap-3 px-8 py-4 font-retro-display text-xs brand-btn-magenta disabled:opacity-50"
            >
              {creatingSolo ? "CREATING..." : "PLAY SOLO"}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="group flex items-center gap-3 px-8 py-4 font-retro-display text-xs brand-btn-cyan"
            >
              <span className="transition-transform group-hover:rotate-90">+</span>
              CREATE TABLE
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-black/60 p-10 text-center font-retro-display text-xs text-slate-300 pixel-border border-black">
            LOADING TABLES...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tables
              .filter((t) => {
                if (tableFilter === "private") return isPrivacyTable(t.tokenAddress);
                if (tableFilter === "public") return !isPrivacyTable(t.tokenAddress);
                return true;
              })
              .map((table, idx) => {
              const isWaiting = table.state === "Waiting";
              const isShielded = isPrivacyTable(table.tokenAddress);
              const isTrusted = isTrustedVerifiers(table.shuffleVerifier, table.decryptVerifier);
              const roomName = ROOM_NAMES[idx % ROOM_NAMES.length];
              const roomBackground = ROOM_BACKGROUNDS[idx % ROOM_BACKGROUNDS.length];
              return (
                <div key={table.tableId} className="group relative pt-8">
                  <div className="absolute -top-4 left-1/2 z-10 -translate-x-1/2 flex gap-2">
                    <div
                      className={`px-3 py-1 font-retro-display text-[9px] text-white pixel-border ${
                        isWaiting ? "bg-green-500" : "bg-red-500"
                      }`}
                    >
                      {isWaiting ? "WAITING" : "IN PROGRESS"}
                    </div>
                    {isShielded && (
                      <div className="bg-purple-600 px-3 py-1 font-retro-display text-[9px] text-white pixel-border">
                        SHIELDED
                      </div>
                    )}
                    {!isTrusted && (
                      <div className="bg-red-600 px-3 py-1 font-retro-display text-[9px] text-white pixel-border">
                        UNVERIFIED
                      </div>
                    )}
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
                          {isShielded
                            ? `${Number(table.smallBlind) / 1e18}/${Number(table.bigBlind) / 1e18} STRK`
                            : `${Number(table.smallBlind)}/${Number(table.bigBlind)}`}
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
                        <span className="text-white">
                          {isShielded
                            ? `${Number(table.minBuyIn) / 1e18} STRK`
                            : Number(table.minBuyIn)}
                        </span>
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
            {tables.length > 0 &&
              !tables.some((t) =>
                tableFilter === "private"
                  ? isPrivacyTable(t.tokenAddress)
                  : tableFilter === "public"
                    ? !isPrivacyTable(t.tokenAddress)
                    : false,
              ) &&
              tableFilter !== "all" && (
                <div className="col-span-full bg-black/60 p-10 text-center font-retro-display text-xs text-slate-300 pixel-border border-black">
                  NO {tableFilter === "private" ? "PRIVATE" : "PUBLIC"} TABLES FOUND.
                </div>
              )}
          </div>
        )}
      </main>

      {showTongoWallet && address && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowTongoWallet(false)}
        >
          <div
            className="mt-16 w-full max-w-sm overflow-hidden rounded-sm brand-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-black bg-black/10 p-4">
              <h3 className="font-retro-display text-[10px] text-slate-300">CONFIDENTIAL WALLET</h3>
              <button
                onClick={() => setShowTongoWallet(false)}
                className="font-retro-display text-xs text-slate-400 hover:text-white"
              >
                X
              </button>
            </div>
            <TongoWallet tongo={tongo} walletAddress={address} />
          </div>
        </div>
      )}

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

              <div
                className={`flex items-center justify-between border-4 px-4 py-3 cursor-pointer transition-colors ${
                  createForm.privacyMode
                    ? "border-purple-500 bg-purple-900/30"
                    : "border-black bg-slate-900"
                }`}
                onClick={() =>
                  setCreateForm({ ...createForm, privacyMode: !createForm.privacyMode })
                }
              >
                <div>
                  <span className="font-retro-display text-[10px] text-white">
                    PRIVACY MODE
                  </span>
                  <p className="font-retro-display text-[8px] text-slate-400 mt-1">
                    Uses STRK via Tongo for shielded bankrolls
                  </p>
                </div>
                <div
                  className={`h-6 w-11 rounded-full transition-colors ${
                    createForm.privacyMode ? "bg-purple-500" : "bg-slate-700"
                  }`}
                >
                  <div
                    className={`h-5 w-5 rounded-full bg-white transition-transform mt-0.5 ${
                      createForm.privacyMode ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </div>

              {createForm.privacyMode && (
                <div className="border-l-4 border-purple-500 bg-purple-500/10 p-3 font-retro-display text-[8px] text-purple-200">
                  Values above are in whole STRK (e.g. 5 = 5 STRK). Players can buy in privately via Tongo — bankroll stays hidden between sessions.
                </div>
              )}

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
