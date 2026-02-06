"use client";

import { useState, useCallback } from "react";

export interface ChatMessageData {
  tableId: number;
  messageId: number;
  sender: string;
  senderSeat: number;
  messageType: "Text" | "Emote" | "System";
  content: string;
  timestamp: number;
}

const EMOTES: Record<string, string> = {
  gg: "GG",
  nh: "Nice hand!",
  ty: "Thank you",
  gl: "Good luck",
  wp: "Well played",
  lol: "LOL",
  wow: "Wow!",
  bluff: "Is that a bluff?",
};

interface UseChatReturn {
  messages: ChatMessageData[];
  emotes: Record<string, string>;
  sendMessage: (content: string) => Promise<void>;
  sendEmote: (emoteId: string) => Promise<void>;
}

export function useChat(tableId: number): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);

  // TODO: Subscribe to ChatMessage models via Torii
  // Filter by table_id = tableId, order by message_id

  const sendMessage = useCallback(
    async (content: string) => {
      console.log(`[Chat ${tableId}] Message: ${content}`);
      // await execute("pokerstarks", "chat_system", "send_message", [tableId, content]);

      // Optimistic update for demo
      setMessages((prev) => [
        ...prev,
        {
          tableId,
          messageId: prev.length,
          sender: "You",
          senderSeat: 0,
          messageType: "Text",
          content,
          timestamp: Date.now(),
        },
      ]);
    },
    [tableId],
  );

  const sendEmote = useCallback(
    async (emoteId: string) => {
      console.log(`[Chat ${tableId}] Emote: ${emoteId}`);
      // await execute("pokerstarks", "chat_system", "send_emote", [tableId, emoteId]);

      setMessages((prev) => [
        ...prev,
        {
          tableId,
          messageId: prev.length,
          sender: "You",
          senderSeat: 0,
          messageType: "Emote",
          content: EMOTES[emoteId] || emoteId,
          timestamp: Date.now(),
        },
      ]);
    },
    [tableId],
  );

  return { messages, emotes: EMOTES, sendMessage, sendEmote };
}
