"use client";

import { useState, useEffect, useCallback } from "react";

export interface ReasoningEntry {
  agentId: number;
  agentName: string;
  personality: string;
  reasoning: string;
  action: string;
  timestamp: number;
}

export interface UseAgentReasoningReturn {
  agents: Record<string, ReasoningEntry>;
  history: ReasoningEntry[];
  loading: boolean;
}

const DEFAULT_URL = process.env.NEXT_PUBLIC_REASONING_URL ?? "http://localhost:3001";

export function useAgentReasoning(reasoningUrl: string = DEFAULT_URL): UseAgentReasoningReturn {
  const [agents, setAgents] = useState<Record<string, ReasoningEntry>>({});
  const [history, setHistory] = useState<ReasoningEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${reasoningUrl}/reasoning`);
      if (!res.ok) return;
      const data = await res.json();
      setAgents(data.agents ?? {});
      setHistory(data.history ?? []);
      setLoading(false);
    } catch {
      // Reasoning server may not be running
      setLoading(false);
    }
  }, [reasoningUrl]);

  useEffect(() => {
    poll();
    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, [poll]);

  return { agents, history, loading };
}
