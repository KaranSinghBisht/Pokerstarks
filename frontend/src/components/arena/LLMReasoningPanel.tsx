"use client";

import { useState, useEffect, useRef } from "react";
import { useAgentReasoning } from "@/hooks/useAgentReasoning";

interface Props {
  matchId: number;
  reasoningUrl?: string;
}

const AGENT_COLORS = [
  { border: "border-[var(--primary)]", bg: "bg-[var(--primary)]", text: "text-[var(--primary)]" },
  { border: "border-[var(--secondary)]", bg: "bg-[var(--secondary)]", text: "text-[var(--secondary)]" },
  { border: "border-blue-400", bg: "bg-blue-400", text: "text-blue-400" },
  { border: "border-purple-400", bg: "bg-purple-400", text: "text-purple-400" },
  { border: "border-red-400", bg: "bg-red-400", text: "text-red-400" },
  { border: "border-green-400", bg: "bg-green-400", text: "text-green-400" },
];

function getAgentColor(idx: number) {
  return AGENT_COLORS[idx % AGENT_COLORS.length];
}

export default function LLMReasoningPanel({ matchId, reasoningUrl }: Props) {
  const { agents, history } = useAgentReasoning(reasoningUrl);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const agentIds = Object.keys(agents);

  // Default to first agent
  useEffect(() => {
    if (!activeTab && agentIds.length > 0) {
      setActiveTab(agentIds[0]);
    }
  }, [agentIds, activeTab]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const activeAgent = activeTab ? agents[activeTab] : null;
  const agentHistory = history.filter(
    (e) => !activeTab || String(e.agentId) === activeTab,
  );

  return (
    <div className="brand-panel p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-retro-display text-xs text-[var(--primary)] uppercase">
          Chain of Thought
        </h3>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${agentIds.length > 0 ? "bg-green-500 animate-pulse" : "bg-white/20"}`}
          />
          <span className="font-retro-display text-[7px] text-white/30">
            Match #{matchId}
          </span>
        </div>
      </div>

      {/* Agent Tabs */}
      {agentIds.length > 1 && (
        <div className="mb-4 flex gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab(null)}
            className={`shrink-0 px-3 py-1.5 font-retro-display text-[8px] uppercase transition-colors ${
              activeTab === null
                ? "bg-white/10 text-white border border-white/20"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            ALL
          </button>
          {agentIds.map((id, i) => {
            const agent = agents[id];
            const color = getAgentColor(i);
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`shrink-0 px-3 py-1.5 font-retro-display text-[8px] uppercase transition-colors ${
                  activeTab === id
                    ? `bg-white/10 ${color.text} border ${color.border}/30`
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                {agent.agentName || `Agent #${id}`}
              </button>
            );
          })}
        </div>
      )}

      {/* Current Decision */}
      {activeAgent?.reasoning ? (
        <div className="mb-4 border-l-2 border-[var(--primary)]/50 bg-[var(--primary)]/5 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="font-retro-display text-[8px] text-[var(--primary)] uppercase">
              {activeAgent.agentName} — {activeAgent.personality}
            </div>
          </div>
          <div className="font-retro-display text-[10px] text-[var(--secondary)] mb-2">
            {activeAgent.action}
          </div>
          <div className="font-retro-body text-xs text-white/70 leading-relaxed">
            {activeAgent.reasoning}
          </div>
        </div>
      ) : agentIds.length === 0 ? (
        <div className="mb-4 py-4 text-center font-retro-body text-xs text-white/30">
          Waiting for agent decisions...
        </div>
      ) : activeTab && !activeAgent?.reasoning ? (
        <div className="mb-4 py-4 text-center font-retro-body text-xs text-white/30">
          {agents[activeTab]?.agentName ?? `Agent #${activeTab}`} is thinking...
        </div>
      ) : null}

      {/* Multi-agent "All" view — show latest from each agent */}
      {activeTab === null && agentIds.length > 0 && (
        <div className="mb-4 space-y-3">
          {agentIds.map((id, i) => {
            const agent = agents[id];
            const color = getAgentColor(i);
            if (!agent.reasoning) return null;
            return (
              <div key={id} className={`border-l-2 ${color.border}/50 pl-3 py-2`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-retro-display text-[8px] ${color.text} uppercase`}>
                    {agent.agentName}
                  </span>
                  <span className="font-retro-display text-[7px] text-white/20 uppercase">
                    {agent.personality}
                  </span>
                </div>
                <div className="font-retro-display text-[9px] text-white/50 mb-1">
                  {agent.action}
                </div>
                <div className="font-retro-body text-[10px] text-white/60 leading-snug">
                  {agent.reasoning}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History */}
      {agentHistory.length > 0 && (
        <div>
          <div className="font-retro-display text-[8px] text-white/30 uppercase mb-2">
            Decision Log
          </div>
          <div
            ref={scrollRef}
            className="max-h-48 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-white/10"
          >
            {agentHistory.slice(-20).map((entry, i) => {
              const agentIdx = agentIds.indexOf(String(entry.agentId));
              const color = getAgentColor(agentIdx >= 0 ? agentIdx : 0);
              return (
                <div key={i} className={`border-l ${color.border}/30 pl-3 py-1`}>
                  <div className="flex items-center gap-2">
                    <span className={`font-retro-display text-[7px] ${color.text}`}>
                      {entry.agentName || `#${entry.agentId}`}
                    </span>
                    <span className="font-retro-display text-[8px] text-white/40">
                      {entry.action}
                    </span>
                  </div>
                  <div className="font-retro-body text-[10px] text-white/50 leading-snug">
                    {entry.reasoning}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
