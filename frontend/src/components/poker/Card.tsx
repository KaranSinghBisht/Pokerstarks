"use client";

import { cardIdToRank, cardIdToSuit } from "@/lib/constants";

interface CardProps {
  cardId: number; // 0-51, or 255 for face-down
  small?: boolean;
}

const SUIT_NAME: Record<string, string> = {
  "♣": "clubs",
  "♦": "diamonds",
  "♥": "hearts",
  "♠": "spades",
};

function cardImageSrc(cardId: number): string {
  if (cardId === 255) return "/retro/cards/back/back_red.png";
  const rank = cardIdToRank(cardId); // "2".."10","J","Q","K","A"
  const suitGlyph = cardIdToSuit(cardId);
  const suit = SUIT_NAME[suitGlyph] ?? "unknown";
  return `/retro/cards/front/${suit}_${rank}.png`;
}

export default function Card({ cardId, small }: CardProps) {
  const size = small ? "h-14 w-10" : "h-20 w-14";

  return (
    <div
      className={`${size} overflow-hidden border-2 border-black bg-white pixel-border-sm`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cardImageSrc(cardId)}
        alt={cardId === 255 ? "Card back" : `Card ${cardId}`}
        className="h-full w-full object-cover"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}
