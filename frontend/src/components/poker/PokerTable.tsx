"use client";

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
import { PlayerAction, GamePhase } from "@/lib/constants";

// 6-seat oval layout positions (percentage-based)
const SEAT_POSITIONS = [
  { top: "85%", left: "50%" },  // seat 0: bottom center
  { top: "65%", left: "10%" },  // seat 1: bottom left
  { top: "20%", left: "10%" },  // seat 2: top left
  { top: "5%", left: "50%" },   // seat 3: top center
  { top: "20%", left: "90%" },  // seat 4: top right
  { top: "65%", left: "90%" },  // seat 5: bottom right
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
  /** Decrypted hole cards from client-side crypto */
  myHoleCards?: [number, number] | null;
  /** Whether the local player is generating a ZK proof */
  isProving?: boolean;
  /** Proof generation progress 0-100 */
  provingProgress?: number;
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
}: PokerTableProps) {
  const localSeat = seats.find(
    (s) => s.isOccupied && s.player === localPlayerAddress
  );
  const localPlayerHand = playerHands.find(
    (ph) => localSeat && ph.seatIndex === localSeat.seatIndex
  );

  const isBettingPhase =
    hand?.phase === GamePhase.BettingPreflop ||
    hand?.phase === GamePhase.BettingFlop ||
    hand?.phase === GamePhase.BettingTurn ||
    hand?.phase === GamePhase.BettingRiver;

  const isLocalPlayerTurn =
    isBettingPhase && localSeat && hand?.currentTurnSeat === localSeat.seatIndex;

  return (
    <div className="relative w-full max-w-4xl aspect-[16/10] mx-auto">
      {/* Table felt */}
      <div className="absolute inset-4 rounded-[50%] bg-gradient-to-br from-green-800 to-green-900 border-4 border-amber-800 shadow-2xl shadow-black/50">
        {/* Inner rail */}
        <div className="absolute inset-3 rounded-[50%] border-2 border-green-700/30" />

        {/* Pot display */}
        {hand && hand.pot > 0n && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-8">
            <div className="bg-black/40 px-4 py-2 rounded-full border border-amber-600/50">
              <span className="text-amber-400 font-bold text-lg">
                Pot: {Number(hand.pot)}
              </span>
            </div>
          </div>
        )}

        {/* Community cards */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -mt-4">
          <CommunityCardsComponent
            cards={communityCards}
            phase={hand?.phase || ""}
          />
        </div>

        {/* Phase indicator */}
        {hand && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <span className="text-xs text-gray-400 bg-black/30 px-3 py-1 rounded-full">
              {hand.phase}
            </span>
          </div>
        )}

        {/* Shuffle/Dealing progress overlay */}
        {hand && (hand.phase === GamePhase.Setup || hand.phase === GamePhase.Shuffling) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/80 rounded-xl p-6 text-center max-w-xs">
              <h3 className="text-white font-bold text-lg mb-3">
                {hand.phase === GamePhase.Setup ? "Key Setup" : "Shuffling Deck"}
              </h3>
              {hand.phase === GamePhase.Shuffling && (
                <div className="mb-3">
                  <div className="text-sm text-gray-400 mb-1">
                    Player {hand.shuffleProgress + 1} of {hand.numPlayers}
                  </div>
                  <div className="bg-gray-700 rounded-full h-2 w-full">
                    <div
                      className="bg-blue-500 rounded-full h-2 transition-all duration-300"
                      style={{ width: `${((hand.shuffleProgress) / hand.numPlayers) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {hand.phase === GamePhase.Setup && (
                <div className="text-sm text-gray-400">
                  Keys: {hand.keysSubmitted} / {hand.numPlayers}
                </div>
              )}
              {isProving && (
                <div className="mt-3">
                  <div className="text-sm text-blue-400 mb-1">
                    Generating ZK proof...
                  </div>
                  <div className="bg-gray-700 rounded-full h-2 w-full">
                    <div
                      className="bg-blue-400 rounded-full h-2 transition-all duration-300"
                      style={{ width: `${provingProgress || 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dealing progress */}
        {hand && (
          hand.phase === GamePhase.DealingPreflop ||
          hand.phase === GamePhase.DealingFlop ||
          hand.phase === GamePhase.DealingTurn ||
          hand.phase === GamePhase.DealingRiver
        ) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/70 rounded-xl px-6 py-4 text-center">
              <div className="text-white font-bold mb-1">Dealing Cards</div>
              <div className="text-sm text-gray-400">
                Submitting reveal tokens...
              </div>
              {isProving && (
                <div className="mt-2 bg-gray-700 rounded-full h-2 w-40">
                  <div
                    className="bg-green-400 rounded-full h-2 transition-all"
                    style={{ width: `${provingProgress || 0}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Player seats */}
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
            seat={seat}
            playerHand={ph}
            isCurrentTurn={hand?.currentTurnSeat === i && isBettingPhase}
            isDealer={hand?.dealerSeat === i}
            isLocalPlayer={seat.player === localPlayerAddress}
            position={SEAT_POSITIONS[i]}
            localHoleCards={seat.player === localPlayerAddress ? myHoleCards : undefined}
          />
        );
      })}

      {/* Controls below table */}
      <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-full max-w-md">
        {/* Betting controls */}
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

        {/* Ready button (pre-game) */}
        {localSeat && !localSeat.isReady && table.state === "Waiting" && (
          <button
            onClick={onReady}
            className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-lg transition-colors"
          >
            Ready
          </button>
        )}

        {/* Waiting indicator */}
        {localSeat?.isReady && table.state === "Waiting" && (
          <div className="text-center text-gray-400 py-3">
            Waiting for other players...
          </div>
        )}
      </div>
    </div>
  );
}
