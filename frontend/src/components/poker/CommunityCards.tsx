"use client";

import Card from "./Card";
import type { CommunityCardsData } from "@/lib/types";

interface CommunityCardsProps {
  cards?: CommunityCardsData;
  phase: string;
}

export default function CommunityCards({ cards, phase }: CommunityCardsProps) {
  const showFlop = cards && cards.flop1 !== 255;
  const showTurn = cards && cards.turn !== 255;
  const showRiver = cards && cards.river !== 255;

  return (
    <div className="flex gap-2 items-center justify-center">
      {/* Flop */}
      {showFlop ? (
        <>
          <Card cardId={cards.flop1} />
          <Card cardId={cards.flop2} />
          <Card cardId={cards.flop3} />
        </>
      ) : (
        <>
          <div className="w-14 h-20 rounded-lg border border-gray-700 bg-gray-800/30" />
          <div className="w-14 h-20 rounded-lg border border-gray-700 bg-gray-800/30" />
          <div className="w-14 h-20 rounded-lg border border-gray-700 bg-gray-800/30" />
        </>
      )}

      {/* Turn */}
      <div className="ml-2">
        {showTurn ? (
          <Card cardId={cards.turn} />
        ) : (
          <div className="w-14 h-20 rounded-lg border border-gray-700 bg-gray-800/30" />
        )}
      </div>

      {/* River */}
      <div className="ml-2">
        {showRiver ? (
          <Card cardId={cards.river} />
        ) : (
          <div className="w-14 h-20 rounded-lg border border-gray-700 bg-gray-800/30" />
        )}
      </div>
    </div>
  );
}
