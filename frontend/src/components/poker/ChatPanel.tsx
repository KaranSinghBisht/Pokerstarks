"use client";

import { useState } from "react";
import { useChat } from "@/hooks/useChat";

interface ChatPanelProps {
  tableId: number;
}

export default function ChatPanel({ tableId }: ChatPanelProps) {
  const { messages, emotes, sendMessage, sendEmote } = useChat(tableId);
  const [input, setInput] = useState("");
  const [showEmotes, setShowEmotes] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Chat</h3>
        <span className="text-xs text-gray-500">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-4">
            No messages yet. Say hi!
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.messageId} className="text-sm">
            {msg.messageType === "System" ? (
              <span className="text-gray-500 italic">{msg.content}</span>
            ) : msg.messageType === "Emote" ? (
              <div>
                <span className="text-amber-400 font-medium text-xs">
                  {msg.sender}
                </span>{" "}
                <span className="text-yellow-300">{msg.content}</span>
              </div>
            ) : (
              <div>
                <span className="text-amber-400 font-medium text-xs">
                  {msg.sender}:
                </span>{" "}
                <span className="text-gray-300">{msg.content}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Emote bar */}
      {showEmotes && (
        <div className="px-3 py-2 border-t border-gray-800 flex flex-wrap gap-1">
          {Object.entries(emotes).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                sendEmote(id);
                setShowEmotes(false);
              }}
              className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-yellow-300 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2 border-t border-gray-800 flex gap-2">
        <button
          onClick={() => setShowEmotes(!showEmotes)}
          className="px-2 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-yellow-400 transition-colors"
          title="Emotes"
        >
          :)
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 px-3 py-1.5 text-sm rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
        />
        <button
          onClick={handleSend}
          className="px-3 py-1.5 text-sm rounded bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
