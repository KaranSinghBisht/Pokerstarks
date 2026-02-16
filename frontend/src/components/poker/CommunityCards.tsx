"use client";

import Card from "./Card";
import type { CommunityCardsData } from "@/lib/types";

interface CommunityCardsProps {
  cards?: CommunityCardsData;
  phase: string;
}

export default function CommunityCards({ cards, phase }: CommunityCardsProps) {
  void phase;
  const showFlop = cards && cards.flop1 !== 255;
  const showTurn = cards && cards.turn !== 255;
  const showRiver = cards && cards.river !== 255;

  return (
    <div className="flex items-center justify-center gap-3">
      {/* Flop */}
      {showFlop ? (
        <>
          <Card cardId={cards.flop1} />
          <Card cardId={cards.flop2} />
          <Card cardId={cards.flop3} />
        </>
      ) : (
        <>
          <div className="h-20 w-14 border-2 border-dashed border-white/20 bg-black/20" />
          <div className="h-20 w-14 border-2 border-dashed border-white/20 bg-black/20" />
          <div className="h-20 w-14 border-2 border-dashed border-white/20 bg-black/20" />
        </>
      )}

      {/* Turn */}
      <div className="ml-1">
        {showTurn ? (
          <Card cardId={cards.turn} />
        ) : (
          <div className="flex h-20 w-14 items-center justify-center border-2 border-dashed border-white/20 bg-black/20 font-retro-display text-[8px] text-white/30">
            TURN
          </div>
        )}
      </div>

      {/* River */}
      <div className="ml-1">
        {showRiver ? (
          <Card cardId={cards.river} />
        ) : (
          <div className="flex h-20 w-14 items-center justify-center border-2 border-dashed border-white/20 bg-black/20 font-retro-display text-[8px] text-white/30">
            RIVER
          </div>
        )}
      </div>
    </div>
  );
}
