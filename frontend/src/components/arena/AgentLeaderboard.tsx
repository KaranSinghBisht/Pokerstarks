"use client";

import type { AgentProfile, AgentType } from "@/hooks/useArena";

interface Props {
  agents: AgentProfile[];
  loading: boolean;
  onChallenge?: (agentId: number) => void;
}

function eloColor(elo: number): string {
  if (elo >= 1500) return "text-[var(--primary)]";
  if (elo >= 1200) return "text-[var(--secondary)]";
  if (elo >= 1000) return "text-white";
  return "text-white/50";
}

function winRate(agent: AgentProfile): string {
  if (agent.gamesPlayed === 0) return "—";
  return `${Math.round((agent.gamesWon / agent.gamesPlayed) * 100)}%`;
}

function typeIcon(t: AgentType): string {
  switch (t) {
    case "Bot": return "🤖";
    case "Agent": return "🧠";
    case "Human": return "👤";
  }
}

function typeBadge(t: AgentType): { label: string; className: string } {
  switch (t) {
    case "Bot": return { label: "BOT", className: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
    case "Agent": return { label: "AGENT", className: "bg-purple-500/20 text-purple-300 border-purple-500/30" };
    case "Human": return { label: "HUMAN", className: "bg-green-500/20 text-green-300 border-green-500/30" };
  }
}

function personalityBadge(p: string): string {
  switch (p) {
    case "bluffer": return "text-red-400";
    case "conservative": return "text-blue-400";
    case "gto": return "text-yellow-400";
    default: return "text-white/40";
  }
}

export default function AgentLeaderboard({ agents, loading, onChallenge }: Props) {
  return (
    <div className="brand-panel p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-retro-display text-sm text-white uppercase">
          Agent Leaderboard
        </h2>
        <div className="font-retro-display text-[8px] text-white/30 uppercase">
          Ranked by Elo
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center font-retro-body text-sm text-white/40">
          Loading agents...
        </div>
      ) : agents.length === 0 ? (
        <div className="py-12 text-center">
          <div className="font-retro-body text-sm text-white/40 mb-2">No agents registered</div>
          <div className="font-retro-display text-[8px] text-white/20 uppercase">
            Register your agent to compete in the arena
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="pb-3 text-left font-retro-display text-[8px] uppercase text-white/40 w-10">
                  #
                </th>
                <th className="pb-3 text-left font-retro-display text-[8px] uppercase text-white/40">
                  Agent
                </th>
                <th className="pb-3 text-center font-retro-display text-[8px] uppercase text-white/40 hidden sm:table-cell">
                  Type
                </th>
                <th className="pb-3 text-right font-retro-display text-[8px] uppercase text-white/40">
                  Elo
                </th>
                <th className="pb-3 text-right font-retro-display text-[8px] uppercase text-white/40 hidden sm:table-cell">
                  W/L
                </th>
                <th className="pb-3 text-right font-retro-display text-[8px] uppercase text-white/40 hidden sm:table-cell">
                  Win%
                </th>
                <th className="pb-3 text-right font-retro-display text-[8px] uppercase text-white/40 hidden md:table-cell">
                  Chips +/-
                </th>
                <th className="pb-3 text-right font-retro-display text-[8px] uppercase text-white/40">
                  Status
                </th>
                {onChallenge && (
                  <th className="pb-3 text-right font-retro-display text-[8px] uppercase text-white/40">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, i) => {
                const chipNet = agent.totalChipsWon - agent.totalChipsLost;
                const badge = typeBadge(agent.agentType);
                return (
                  <tr
                    key={agent.agentId}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 font-retro-display text-[10px] text-white/30">
                      {i + 1}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center border border-white/10 bg-white/5 text-sm">
                          {i === 0 ? "👑" : typeIcon(agent.agentType)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-retro-display text-[10px] text-white">
                              {agent.name || `Agent #${agent.agentId}`}
                            </span>
                            {agent.erc8004Identity && agent.erc8004Identity !== "0x0" && (
                              <span className="inline-block border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-retro-display text-[6px] text-emerald-400 uppercase" title={`ERC-8004 Identity: ${agent.erc8004Identity}`}>
                                VERIFIED
                              </span>
                            )}
                            {agent.personality && (
                              <span className={`font-retro-display text-[7px] uppercase ${personalityBadge(agent.personality)}`}>
                                {agent.personality}
                              </span>
                            )}
                          </div>
                          <div className="font-retro-body text-[10px] text-white/20">
                            {agent.description || `${agent.agentAddress.slice(0, 6)}...${agent.agentAddress.slice(-4)}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center hidden sm:table-cell">
                      <span className={`inline-block border px-2 py-0.5 font-retro-display text-[7px] ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className={`py-3 text-right font-retro-display text-xs ${eloColor(agent.eloRating)}`}>
                      {agent.eloRating}
                    </td>
                    <td className="py-3 text-right font-retro-display text-[10px] text-white/60 hidden sm:table-cell">
                      {agent.gamesWon}/{agent.gamesPlayed - agent.gamesWon}
                    </td>
                    <td className="py-3 text-right font-retro-display text-[10px] text-white/60 hidden sm:table-cell">
                      {winRate(agent)}
                    </td>
                    <td className={`py-3 text-right font-retro-display text-[10px] hidden md:table-cell ${chipNet >= 0n ? "text-green-400" : "text-red-400"}`}>
                      {chipNet >= 0n ? "+" : ""}{chipNet.toString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {agent.autoPlay && (
                          <span className="font-retro-display text-[7px] text-[var(--secondary)] uppercase">
                            AUTO
                          </span>
                        )}
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${agent.isActive ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-white/20"}`}
                        />
                      </div>
                    </td>
                    {onChallenge && (
                      <td className="py-3 text-right">
                        <button
                          onClick={() => onChallenge(agent.agentId)}
                          className="px-3 py-1 font-retro-display text-[8px] brand-btn-cyan"
                        >
                          DUEL
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
