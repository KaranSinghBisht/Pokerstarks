"use client";

import { useEffect, useRef } from "react";
import { useStarknet } from "@/providers/StarknetProvider";

interface WalletSelectorProps {
  onClose: () => void;
}

const WALLET_OPTIONS = [
  {
    id: "controller" as const,
    label: "CARTRIDGE CONTROLLER",
    tag: "RECOMMENDED",
    tagColor: "bg-green-600",
    description: "Session keys, gasless, gaming-optimized",
  },
  {
    id: "starkzap" as const,
    label: "EMAIL / SOCIAL LOGIN",
    tag: "STARKZAP",
    tagColor: "bg-purple-600",
    description: "No browser extension needed (Privy)",
  },
  {
    id: "injected" as const,
    label: "BROWSER WALLET",
    tag: null,
    tagColor: "",
    description: "ArgentX / Braavos extension",
  },
] as const;

export default function WalletSelector({ onClose }: WalletSelectorProps) {
  const { connectController, connectInjected, connectWithStarkZap, connecting, isConnected, error } = useStarknet();

  const handleSelect = async (id: "controller" | "starkzap" | "injected") => {
    if (id === "controller") {
      await connectController();
    } else if (id === "starkzap") {
      await connectWithStarkZap();
    } else {
      await connectInjected();
    }
  };

  // Auto-close when connection succeeds
  const prevConnected = useRef(isConnected);
  useEffect(() => {
    if (!prevConnected.current && isConnected) {
      onClose();
    }
    prevConnected.current = isConnected;
  }, [isConnected, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm p-6 text-white pixel-border-primary brand-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 font-retro-display text-xs text-slate-400 transition-colors hover:text-[var(--primary)]"
        >
          X
        </button>

        <h3 className="mb-6 font-retro-display text-sm text-[var(--primary)] pixel-text-shadow">
          SELECT WALLET
        </h3>

        <div className="space-y-3">
          {WALLET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              disabled={connecting}
              className="group w-full border-4 border-black bg-slate-900 p-4 text-left transition-colors hover:border-[var(--primary)] disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <span className="font-retro-display text-[10px] text-white group-hover:text-[var(--primary)]">
                  {opt.label}
                </span>
                {opt.tag && (
                  <span
                    className={`${opt.tagColor} px-2 py-0.5 font-retro-display text-[7px] text-white`}
                  >
                    {opt.tag}
                  </span>
                )}
              </div>
              <p className="mt-1 font-retro-display text-[8px] text-slate-400">
                {opt.description}
              </p>
            </button>
          ))}
        </div>

        {connecting && (
          <div className="mt-4 text-center font-retro-display text-[9px] text-slate-400 animate-pulse">
            CONNECTING...
          </div>
        )}

        {error && !connecting && (
          <div className="mt-4 border-l-4 border-red-500 bg-red-500/10 p-3 font-retro-display text-[8px] text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
