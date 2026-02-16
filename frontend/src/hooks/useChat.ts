"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { init, ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import { CallData, shortString } from "starknet";
import { NAMESPACE, TORII_URL, WORLD_ADDRESS } from "@/lib/dojo-config";
import { getSystemAddress } from "@/lib/contracts";
import { useStarknet } from "@/providers/StarknetProvider";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DojoSchema = any;

const CHAT_MODEL = `${NAMESPACE}-ChatMessage`;

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) return Number(value);
  return fallback;
}

function asEnum(value: unknown, fallback: ChatMessageData["messageType"]) {
  if (typeof value === "string") return value as ChatMessageData["messageType"];
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0) {
      return keys[0] as ChatMessageData["messageType"];
    }
  }
  return fallback;
}

function decodeFeltContent(content: string): string {
  if (!content) return "";
  try {
    if (content.startsWith("0x")) {
      return shortString.decodeShortString(content as `0x${string}`);
    }
  } catch {
    // Fall through to raw value.
  }
  return content;
}

function parseChatMessage(models: Record<string, unknown>): ChatMessageData | null {
  const msg = models[CHAT_MODEL] as Record<string, unknown> | undefined;
  if (!msg) return null;

  const messageType = asEnum(msg.message_type, "Text");
  const rawContent = String(msg.content ?? "");
  const decoded = decodeFeltContent(rawContent);
  const emoteLabel = messageType === "Emote" ? EMOTES[decoded] || decoded : decoded;

  return {
    tableId: asNumber(msg.table_id),
    messageId: asNumber(msg.message_id),
    sender: String(msg.sender ?? ""),
    senderSeat: asNumber(msg.sender_seat),
    messageType,
    content: emoteLabel,
    timestamp: asNumber(msg.timestamp),
  };
}

interface UseChatReturn {
  messages: ChatMessageData[];
  emotes: Record<string, string>;
  loading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  sendEmote: (emoteId: string) => Promise<void>;
}

export function useChat(tableId: number): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sdkRef = useRef<Awaited<ReturnType<typeof init<DojoSchema>>> | null>(null);
  const { account } = useStarknet();

  const loadMessages = useCallback(async () => {
    try {
      if (!Number.isFinite(tableId) || tableId < 0) {
        throw new Error("Invalid table id for chat.");
      }
      if (!WORLD_ADDRESS || WORLD_ADDRESS === "0x0") {
        throw new Error("NEXT_PUBLIC_WORLD_ADDRESS is not configured.");
      }

      if (!sdkRef.current) {
        sdkRef.current = await init<DojoSchema>({
          client: {
            worldAddress: WORLD_ADDRESS,
            toriiUrl: TORII_URL,
          },
          domain: {
            name: "STARK POKER",
            version: "1.0.0",
            chainId: "SN_SEPOLIA",
          },
        });
      }

      const res = await sdkRef.current.getEntities({
        query: new ToriiQueryBuilder<DojoSchema>()
          .withClause(KeysClause([CHAT_MODEL], [String(tableId)]).build())
          .withLimit(300),
      });

      const parsed: ChatMessageData[] = [];
      for (const entity of res.getItems()) {
        const item = parseChatMessage(entity.models?.[NAMESPACE] ?? {});
        if (item) parsed.push(item);
      }
      parsed.sort((a, b) => a.messageId - b.messageId);
      setMessages(parsed);
      setError(null);
      setLoading(false);
    } catch (err) {
      setMessages([]);
      setError(err instanceof Error ? err.message : "Failed to load chat.");
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    loadMessages();
    const id = window.setInterval(loadMessages, 2000);
    return () => window.clearInterval(id);
  }, [loadMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (!account) {
        throw new Error("Connect your wallet before sending chat messages.");
      }
      if (trimmed.length > 31) {
        throw new Error("Message too long. Max 31 characters.");
      }
      const chatAddress = getSystemAddress("chat");
      if (!chatAddress) {
        throw new Error("Chat system address is not configured.");
      }

      try {
        setError(null);
        const encoded = shortString.encodeShortString(trimmed);
        await account.execute({
          contractAddress: chatAddress,
          entrypoint: "send_message",
          calldata: CallData.compile([String(tableId), encoded]),
        });
        await loadMessages();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send message.";
        setError(message);
        throw new Error(message);
      }
    },
    [account, loadMessages, tableId],
  );

  const sendEmote = useCallback(
    async (emoteId: string) => {
      if (!account) {
        throw new Error("Connect your wallet before sending emotes.");
      }
      const chatAddress = getSystemAddress("chat");
      if (!chatAddress) {
        throw new Error("Chat system address is not configured.");
      }
      if (!EMOTES[emoteId]) {
        throw new Error("Unsupported emote.");
      }

      try {
        setError(null);
        const encoded = shortString.encodeShortString(emoteId);
        await account.execute({
          contractAddress: chatAddress,
          entrypoint: "send_emote",
          calldata: CallData.compile([String(tableId), encoded]),
        });
        await loadMessages();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send emote.";
        setError(message);
        throw new Error(message);
      }
    },
    [account, loadMessages, tableId],
  );

  return { messages, emotes: EMOTES, loading, error, sendMessage, sendEmote };
}
