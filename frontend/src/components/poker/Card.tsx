"use client";

import { cardIdToRank, cardIdToSuit, SUIT_COLORS } from "@/lib/constants";

interface CardProps {
  cardId: number; // 0-51, or 255 for face-down
  small?: boolean;
}

export default function Card({ cardId, small }: CardProps) {
  const isFaceDown = cardId === 255;
  const size = small ? "w-10 h-14 text-xs" : "w-14 h-20 text-sm";

  if (isFaceDown) {
    return (
      <div
        className={`${size} rounded-lg border-2 border-gray-600 bg-gradient-to-br from-blue-800 to-blue-950 flex items-center justify-center shadow-md`}
      >
        <div className="w-3/4 h-3/4 rounded border border-blue-600 bg-blue-900/50" />
      </div>
    );
  }

  const rank = cardIdToRank(cardId);
  const suit = cardIdToSuit(cardId);
  const color = SUIT_COLORS[suit] || "text-gray-900";

  return (
    <div
      className={`${size} rounded-lg border border-gray-300 bg-white flex flex-col items-center justify-center shadow-md ${color} font-bold`}
    >
      <span className={small ? "text-xs" : "text-base"}>{rank}</span>
      <span className={small ? "text-sm" : "text-lg"}>{suit}</span>
    </div>
  );
}
