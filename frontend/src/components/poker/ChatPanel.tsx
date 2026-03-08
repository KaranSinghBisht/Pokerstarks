"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useChat } from "@/hooks/useChat";
import { useStarknet } from "@/providers/StarknetProvider";

const EMOTE_ICONS: Record<string, string> = {
  gg: "GG",
  nh: "NH",
  ty: "TY",
  gl: "GL",
  wp: "WP",
  lol: "LOL",
  wow: "WOW",
  bluff: "?!",
};

interface ChatPanelProps {
  tableId: number;
}

export default function ChatPanel({ tableId }: ChatPanelProps) {
  const { messages, emotes, loading, error, sendMessage, sendEmote } = useChat(tableId);
  const { address } = useStarknet();
  const [input, setInput] = useState("");
  const [showEmotes, setShowEmotes] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = input.trim().slice(0, 31);
    if (!trimmed) return;
    try {
      setLocalError(null);
      await sendMessage(trimmed);
      setInput("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to send chat message.");
    }
  };

  const activeError = localError || error;

  return (
    <div className="flex h-full w-full flex-col bg-black/35">
      <div className="flex items-center justify-between border-b-2 border-black bg-black/10 p-4">
        <h3 className="font-retro-display text-[10px] text-slate-300">TABLE CHAT</h3>
        <span className="font-retro-display text-[8px] text-slate-500">
          {messages.length}
        </span>
      </div>

      <div className="scrollbar-pixel min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {activeError && (
          <div className="border-l-2 border-red-500 bg-red-500/10 p-2 text-[10px] text-red-200">
            {activeError}
          </div>
        )}

        {loading && messages.length === 0 && (
          <p className="pt-4 text-center font-retro-display text-[8px] text-slate-500">
            LOADING CHAT...
          </p>
        )}

        {!loading && messages.length === 0 && (
          <p className="pt-4 text-center font-retro-display text-[8px] text-slate-500">
            NO MESSAGES YET.
          </p>
        )}

        {messages.map((msg) => {
          const isMine =
            !!address && msg.sender.toLowerCase() === address.toLowerCase();
          const senderLabel = isMine
            ? "YOU"
            : msg.senderSeat >= 0
              ? `SEAT ${msg.senderSeat + 1}`
              : `${msg.sender.slice(0, 6)}...${msg.sender.slice(-4)}`;

          return (
            <div key={msg.messageId} className="flex flex-col gap-1">
              {msg.messageType === "System" ? (
                <>
                  <span className="font-retro-display text-[8px] uppercase text-[var(--accent)]">
                    SYSTEM
                  </span>
                  <div className="border-l-2 border-[var(--accent)] bg-black/40 p-2 text-[11px] italic text-slate-300">
                    {msg.content}
                  </div>
                </>
              ) : msg.messageType === "Emote" ? (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="flex items-center gap-2"
                >
                  <span className="font-retro-display text-[8px] uppercase text-[var(--accent)]">
                    {senderLabel}
                  </span>
                  <div className="inline-flex items-center gap-1 border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 font-retro-display text-[11px] text-[var(--accent)] pixel-border-sm">
                    <span className="text-[13px] font-bold">
                      {EMOTE_ICONS[msg.content.toLowerCase()] || msg.content.slice(0, 3).toUpperCase()}
                    </span>
                    <span className="text-[9px] text-[var(--accent)]/70">{msg.content}</span>
                  </div>
                </motion.div>
              ) : (
                <>
                  <span
                    className={`font-retro-display text-[8px] uppercase ${
                      isMine
                        ? "text-[var(--secondary)]"
                        : "text-[var(--primary)]"
                    }`}
                  >
                    {senderLabel}
                  </span>
                  <div
                    className={`relative p-2 text-[11px] pixel-border-sm ${
                      isMine
                        ? "bg-[var(--primary)]/40 text-white ml-2"
                        : "bg-slate-800/80 text-slate-100 mr-2"
                    }`}
                  >
                    {msg.content}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {showEmotes && (
        <div className="flex flex-wrap gap-1 border-t-2 border-black p-3">
          {Object.entries(emotes).map(([id, label]) => (
            <button
              key={id}
              onClick={async () => {
                try {
                  setLocalError(null);
                  await sendEmote(id);
                  setShowEmotes(false);
                } catch (err) {
                  setLocalError(err instanceof Error ? err.message : "Failed to send emote.");
                }
              }}
              className="bg-slate-700 px-2 py-1 font-retro-display text-[8px] text-[var(--accent)] pixel-border-sm transition-colors hover:bg-slate-600"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="border-t-2 border-black p-4">
        <div className="flex items-center bg-slate-800 p-1 pixel-border-sm">
          <button
            onClick={() => setShowEmotes((s) => !s)}
            className="px-2 py-1 font-retro-display text-[9px] text-[var(--accent)] transition-colors hover:text-white"
            title="Emotes"
          >
            :)
          </button>
          <input
            type="text"
            value={input}
            maxLength={31}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSend()}
            placeholder="SAY SOMETHING (MAX 31)"
            className="w-full border-none bg-transparent px-2 text-[10px] text-white placeholder:text-slate-500 focus:ring-0"
          />
          <button
            onClick={() => void handleSend()}
            className="bg-[var(--primary)] px-3 py-1 font-retro-display text-[9px] text-white pixel-button-shadow transition-all hover:brightness-110"
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  );
}
