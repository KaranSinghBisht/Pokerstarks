"use client";

import { motion, AnimatePresence } from "framer-motion";
import PlayerSeat from "./PlayerSeat";
import CommunityCardsComponent from "./CommunityCards";
import BettingControls from "./BettingControls";
import type {
  TableData,
  SeatData,
  HandData,
  PlayerHandData,
  CommunityCardsData,
} from "@/lib/types";
import {
  PlayerAction,
  GamePhase,
  STRK_TOKEN_ADDRESS,
  CANONICAL_SHUFFLE_VERIFIER,
  CANONICAL_DECRYPT_VERIFIER,
} from "@/lib/constants";

const SEAT_POSITIONS = [
  { top: "90%", left: "50%" }, // seat 0
  { top: "72%", left: "12%" }, // seat 1
  { top: "20%", left: "15%" }, // seat 2
  { top: "3%", left: "50%" }, // seat 3
  { top: "20%", left: "85%" }, // seat 4
  { top: "72%", left: "88%" }, // seat 5
];

interface PokerTableProps {
  table: TableData;
  seats: SeatData[];
  hand?: HandData;
  playerHands: PlayerHandData[];
  communityCards?: CommunityCardsData;
  localPlayerAddress?: string;
  onAction: (action: PlayerAction, amount: bigint) => void;
  onReady: () => void;
  onJoin: (seatIndex: number, buyIn: bigint) => void;
  myHoleCards?: [number, number] | null;
  isProving?: boolean;
  provingProgress?: number;
  isHost?: boolean;
  onFillWithBots?: () => void;
  fillingBots?: boolean;
  isPrivacyMode?: boolean;
}

export default function PokerTable({
  table,
  seats,
  hand,
  playerHands,
  communityCards,
  localPlayerAddress,
  onAction,
  onReady,
  onJoin,
  myHoleCards,
  isProving,
  provingProgress,
  isHost,
  onFillWithBots,
  fillingBots,
  isPrivacyMode: isPrivacyModeProp,
}: PokerTableProps) {
  const localSeat = seats.find((s) => s.isOccupied && s.player === localPlayerAddress);
  const localPlayerHand = playerHands.find(
    (ph) => localSeat && ph.seatIndex === localSeat.seatIndex,
  );

  // Derive privacy mode from prop or token address
  const isPrivacyMode = isPrivacyModeProp ?? (() => {
    try {
      const strk = "0x" + STRK_TOKEN_ADDRESS.slice(2).replace(/^0+/, "").toLowerCase();
      const tbl = "0x" + table.tokenAddress.slice(2).replace(/^0+/, "").toLowerCase();
      return tbl === strk;
    } catch {
      return false;
    }
  })();

  // Detect non-canonical verifier contracts
  const isUntrustedVerifier =
    table.shuffleVerifier !== CANONICAL_SHUFFLE_VERIFIER ||
    table.decryptVerifier !== CANONICAL_DECRYPT_VERIFIER;

  const isBettingPhase =
    hand?.phase === GamePhase.BettingPreflop ||
    hand?.phase === GamePhase.BettingFlop ||
    hand?.phase === GamePhase.BettingTurn ||
    hand?.phase === GamePhase.BettingRiver;

  const isLocalPlayerTurn =
    isBettingPhase && !!localSeat && hand?.currentTurnSeat === localSeat.seatIndex;
  const allowJoinSeat = !!localPlayerAddress && !localSeat && table.state === "Waiting";

  return (
    <div className="relative mx-auto w-full max-w-6xl pb-36">
      {isUntrustedVerifier && (
        <div className="mb-3 border-2 border-red-500 bg-red-900/80 px-4 py-3 font-retro-display text-[9px] text-red-200 pixel-border-sm">
          UNVERIFIED TABLE — Verifier contracts do not match canonical addresses. Shuffle or decrypt proofs may not be validated. Join at your own risk.
        </div>
      )}
      <div className="relative aspect-[2/1] w-full border-4 border-black bg-[var(--felt-border)] p-4 pixel-border">
        <div className="felt-gradient absolute inset-4 rounded-full border-[10px] border-[#5d4037] shadow-2xl shadow-black/50">
          <div className="pointer-events-none absolute inset-2 rounded-full border-4 border-white/10" />

          <AnimatePresence>
            {hand && hand.pot > 0n && (
              <motion.div
                key="pot"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: "spring", stiffness: 350, damping: 20 }}
                className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2"
              >
                <motion.div
                  key={Number(hand.pot)}
                  initial={{ scale: 1.15 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="border-2 border-[var(--accent)]/40 bg-black/45 px-4 py-2 font-retro-display text-[10px] text-[var(--accent)] pixel-border-sm"
                >
                  POT: {Number(hand.pot)}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <CommunityCardsComponent cards={communityCards} phase={hand?.phase || ""} />
          </div>

          {hand && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 flex items-center gap-2">
              <span className="bg-black/70 px-3 py-1 font-retro-display text-[9px] uppercase text-slate-300 pixel-border-sm">
                {hand.phase}
              </span>
              {isPrivacyMode && (
                <span className="bg-purple-600/80 px-2 py-1 font-retro-display text-[8px] text-white pixel-border-sm">
                  PRIVATE TABLE
                </span>
              )}
            </div>
          )}
          {!hand && isPrivacyMode && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2">
              <span className="bg-purple-600/80 px-2 py-1 font-retro-display text-[8px] text-white pixel-border-sm">
                PRIVATE TABLE
              </span>
            </div>
          )}

          {hand && (hand.phase === GamePhase.Setup || hand.phase === GamePhase.Shuffling) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="max-w-xs border-l-4 border-[var(--secondary)] bg-black/75 p-5 pixel-border-sm">
                <h3 className="mb-2 font-retro-display text-[10px] text-[var(--secondary)]">
                  ZK ENGINE ACTIVE
                </h3>
                <div className="font-retro-display text-[9px] text-slate-300">
                  {hand.phase === GamePhase.Setup ? "KEY SETUP" : "SHUFFLING DECK"}
                </div>
                {hand.phase === GamePhase.Shuffling && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between font-retro-display text-[8px] text-slate-400">
                      <span>
                        PLAYER {hand.shuffleProgress + 1} OF {hand.numPlayers}
                      </span>
                      <span>
                        {Math.round((hand.shuffleProgress / Math.max(1, hand.numPlayers)) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-800">
                      <div
                        className="h-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"
                        style={{
                          width: `${(hand.shuffleProgress / Math.max(1, hand.numPlayers)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {hand.phase === GamePhase.Setup && (
                  <div className="mt-3 font-retro-display text-[8px] text-slate-400">
                    KEYS: {hand.keysSubmitted}/{hand.numPlayers}
                  </div>
                )}
                {isProving && (
                  <div className="mt-3">
                    <div className="mb-1 font-retro-display text-[8px] text-[var(--secondary)]">
                      GENERATING PROOF...
                    </div>
                    <div className="h-2 w-full bg-slate-800">
                      <div
                        className="h-full bg-[var(--secondary)] transition-all duration-300"
                        style={{ width: `${provingProgress || 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {hand &&
            (hand.phase === GamePhase.DealingPreflop ||
              hand.phase === GamePhase.DealingFlop ||
              hand.phase === GamePhase.DealingTurn ||
              hand.phase === GamePhase.DealingRiver) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/75 px-5 py-4 text-center pixel-border-sm">
                  <div className="font-retro-display text-[10px] text-white">
                    DEALING CARDS
                  </div>
                  <div className="mt-1 font-retro-display text-[8px] text-slate-400">
                    SUBMITTING REVEAL TOKENS...
                  </div>
                  {isProving && (
                    <div className="mt-2 h-2 w-44 bg-slate-800">
                      <div
                        className="h-full bg-green-400 transition-all"
                        style={{ width: `${provingProgress || 0}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      </div>

      {Array.from({ length: table.maxPlayers }, (_, i) => {
        const seat = seats.find((s) => s.seatIndex === i) || {
          tableId: table.tableId,
          seatIndex: i,
          player: "",
          chips: 0n,
          isOccupied: false,
          isReady: false,
          isSittingOut: false,
        };
        const ph = playerHands.find((p) => p.seatIndex === i);

        return (
          <PlayerSeat
            key={i}
            seatIndex={i}
            seat={seat}
            playerHand={ph}
            isCurrentTurn={!!(hand?.currentTurnSeat === i && isBettingPhase)}
            isDealer={hand?.dealerSeat === i}
            isLocalPlayer={seat.player === localPlayerAddress}
            position={SEAT_POSITIONS[i]}
            localHoleCards={seat.player === localPlayerAddress ? myHoleCards : undefined}
            canJoin={allowJoinSeat && !seat.isOccupied}
            onJoin={() => onJoin(i, table.minBuyIn)}
            isPrivacyMode={isPrivacyMode}
          />
        );
      })}

      <div className="absolute bottom-0 left-0 right-0 z-20">
        {isLocalPlayerTurn && localSeat && (
          <BettingControls
            currentBet={hand?.currentBet || 0n}
            playerBet={localPlayerHand?.betThisRound || 0n}
            playerChips={localSeat.chips}
            bigBlind={table.bigBlind}
            isPlayerTurn={true}
            onAction={onAction}
          />
        )}

        {localSeat && !localSeat.isReady && table.state === "Waiting" && (
          <button
            onClick={onReady}
            className="mx-auto block bg-green-600 px-10 py-3 font-retro-display text-xs text-white pixel-border transition-colors hover:bg-green-500"
          >
            READY
          </button>
        )}

        {localSeat?.isReady && table.state === "Waiting" && (
          <div className="py-3 text-center font-retro-display text-[9px] text-slate-400">
            WAITING FOR OTHER PLAYERS...
          </div>
        )}

        {isHost && table.state === "Waiting" && localSeat && onFillWithBots && (
          <div className="mt-2 flex justify-center">
            <button
              onClick={onFillWithBots}
              disabled={fillingBots}
              className="bg-purple-700 px-6 py-2 font-retro-display text-[9px] text-white pixel-border-sm transition-colors hover:bg-purple-600 disabled:opacity-50"
            >
              {fillingBots ? "SPAWNING BOTS..." : "FILL WITH BOTS"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

