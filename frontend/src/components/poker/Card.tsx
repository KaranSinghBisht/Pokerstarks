"use client";

import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
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
  const rank = cardIdToRank(cardId);
  const suitGlyph = cardIdToSuit(cardId);
  const suit = SUIT_NAME[suitGlyph] ?? "unknown";
  return `/retro/cards/front/${suit}_${rank}.png`;
}

export default function Card({ cardId, small }: CardProps) {
  const size = small ? "h-14 w-10" : "h-20 w-14";
  const prevId = useRef(cardId);
  const [flipping, setFlipping] = useState(false);
  const [displayId, setDisplayId] = useState(cardId);

  useEffect(() => {
    const wasHidden = prevId.current === 255;
    const nowRevealed = cardId !== 255;
    prevId.current = cardId;

    if (wasHidden && nowRevealed) {
      // Start flip: show back for first half, then switch to front
      setFlipping(true);
      setDisplayId(255); // show back during first half
      const timer = setTimeout(() => {
        setDisplayId(cardId); // swap to front at midpoint
      }, 200);
      const endTimer = setTimeout(() => {
        setFlipping(false);
      }, 420);
      return () => { clearTimeout(timer); clearTimeout(endTimer); };
    } else {
      setDisplayId(cardId);
    }
  }, [cardId]);

  return (
    <div className={`${size} pixel-card-shadow card-hover-effect cursor-pointer group`} style={{ perspective: "600px" }}>
      <motion.div
        className={`h-full w-full overflow-hidden border-2 border-black bg-white pixel-border-sm group-hover:border-[var(--primary)] transition-colors`}
        animate={{ rotateY: flipping ? [0, 90, 0] : 0 }}
        transition={flipping ? { duration: 0.42, times: [0, 0.47, 1], ease: "easeInOut" } : { duration: 0 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cardImageSrc(displayId)}
          alt={displayId === 255 ? "Card back" : `Card ${displayId}`}
          className="h-full w-full object-cover group-hover:brightness-110"
          loading="lazy"
          draggable={false}
        />
      </motion.div>
    </div>
  );
}
