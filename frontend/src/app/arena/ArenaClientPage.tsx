"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useStarknet } from "@/providers/StarknetProvider";
import { useArena } from "@/hooks/useArena";
import type { ArenaMatch } from "@/hooks/useArena";
import BrandWordmark from "@/components/brand/BrandWordmark";
import WalletSelector from "@/components/ui/WalletSelector";
import AgentLeaderboard from "@/components/arena/AgentLeaderboard";
import LLMReasoningPanel from "@/components/arena/LLMReasoningPanel";

export default function ArenaClientPage() {
  const { isConnected, connecting, disconnect, address } = useStarknet();
  const { agents, matches, challenges, loading, error } = useArena();
  const [showWalletSelector, setShowWalletSelector] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<ArenaMatch | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<number | null>(null);

  const liveMatches = matches.filter((m) => m.status === "InProgress");
  const completedMatches = matches.filter((m) => m.status === "Complete");
  const pendingChallenges = challenges.filter((c) => c.status === "Pending");

  // Find user's agents
  const myAgents = agents.filter(
    (a) => address && a.owner.toLowerCase() === address.toLowerCase(),
  );

  return (
    <div className="min-h-screen overflow-x-hidden text-white">
      <div className="retro-grid-container fixed inset-0 z-0">
        <div className="retro-grid" />
      </div>

      {/* Nav */}
      <nav className="relative z-30 mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-7xl items-center justify-between rounded-sm px-6 py-4 brand-topbar">
        <BrandWordmark href="/" subtitle="AGENT ARENA" />
        <div className="flex items-center gap-6">
          <Link
            href="/lobby"
            className="hidden font-retro-display text-[10px] uppercase tracking-widest brand-link md:block"
          >
            Lobby
          </Link>
          <Link
            href="/"
            className="hidden font-retro-display text-[10px] uppercase tracking-widest brand-link md:block"
          >
            Home
          </Link>
          <button
            onClick={isConnected ? disconnect : () => setShowWalletSelector(true)}
            disabled={connecting}
            className="px-6 py-2 font-retro-display text-[10px] brand-btn-cyan disabled:opacity-50 active:scale-95 transition-transform"
          >
            {connecting
              ? "CONNECTING..."
              : isConnected
                ? `${address?.slice(0, 6)}...${address?.slice(-4)}`
                : "CONNECT WALLET"}
          </button>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <h1 className="font-retro-display glow-text-primary mb-4 text-4xl text-white md:text-6xl">
            AGENT <span className="text-[var(--primary)]">ARENA</span>
          </h1>
          <p className="font-retro-display text-xs uppercase tracking-[0.3em] text-[var(--secondary)] opacity-80">
            — AI AGENTS COMPETE IN ZK POKER —
          </p>
          {isConnected && (
            <button
              onClick={() => setShowRegister(true)}
              className="mt-6 px-8 py-3 font-retro-display text-[10px] brand-btn-cyan"
            >
              REGISTER YOUR AGENT
            </button>
          )}
        </motion.div>

        {error && (
          <div className="mb-6 border-l-4 border-red-500 bg-red-500/10 p-3 font-retro-display text-[10px] text-red-200">
            {error}
          </div>
        )}

        {/* Stats Bar */}
        <div className="mb-10 grid grid-cols-4 gap-4">
          {[
            { label: "AGENTS", value: agents.length, color: "var(--primary)" },
            { label: "LIVE MATCHES", value: liveMatches.length, color: "var(--success, #22c55e)" },
            { label: "COMPLETED", value: completedMatches.length, color: "var(--secondary)" },
            { label: "CHALLENGES", value: pendingChallenges.length, color: "#f59e0b" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="brand-panel flex flex-col items-center p-4"
            >
              <div
                className="font-retro-display text-2xl"
                style={{ color: stat.color }}
              >
                {loading ? "..." : stat.value}
              </div>
              <div className="font-retro-display text-[8px] uppercase text-white/40">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* My Agents Bar */}
        {myAgents.length > 0 && (
          <div className="mb-8 brand-panel p-4">
            <div className="font-retro-display text-[8px] text-white/40 uppercase mb-3">
              Your Agents
            </div>
            <div className="flex gap-4 overflow-x-auto">
              {myAgents.map((agent) => (
                <div key={agent.agentId} className="shrink-0 flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2">
                  <span className="font-retro-display text-[10px] text-white">
                    {agent.name}
                  </span>
                  <span className="font-retro-display text-[9px] text-[var(--primary)]">
                    {agent.eloRating} ELO
                  </span>
                  <span className={`font-retro-display text-[8px] ${agent.autoPlay ? "text-green-400" : "text-white/30"}`}>
                    {agent.autoPlay ? "AUTO" : "MANUAL"}
                  </span>
                  <span className={`font-retro-display text-[8px] uppercase ${
                    agent.personality === "bluffer" ? "text-red-400" :
                    agent.personality === "conservative" ? "text-blue-400" : "text-yellow-400"
                  }`}>
                    {agent.personality}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Leaderboard (2/3 width) */}
          <div className="lg:col-span-2">
            <AgentLeaderboard
              agents={agents}
              loading={loading}
              onChallenge={isConnected && myAgents.length > 0 ? (id: number) => setChallengeTarget(id) : undefined}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Live Matches */}
            <div className="brand-panel p-6">
              <h3 className="font-retro-display mb-4 text-xs text-[var(--secondary)] uppercase">
                Live Matches
              </h3>
              {loading ? (
                <div className="font-retro-body text-sm text-white/40">Loading...</div>
              ) : liveMatches.length === 0 ? (
                <div className="font-retro-body text-sm text-white/40">No live matches</div>
              ) : (
                <div className="space-y-3">
                  {liveMatches.map((match) => (
                    <button
                      key={match.matchId}
                      onClick={() => setSelectedMatch(match)}
                      className="w-full text-left brand-panel p-3 hover:border-[var(--primary)]/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                          <span className="font-retro-display text-[10px] text-white">
                            Match #{match.matchId}
                          </span>
                        </div>
                        <span className="font-retro-display text-[8px] text-white/40">
                          {match.numAgents} agents
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-retro-display text-[8px] text-white/30">
                          Table #{match.tableId}
                        </span>
                        <span className="font-retro-display text-[8px] text-[var(--secondary)]">
                          Buy-in: {match.buyIn.toString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Challenges */}
            {pendingChallenges.length > 0 && (
              <div className="brand-panel p-6">
                <h3 className="font-retro-display mb-4 text-xs text-amber-400 uppercase">
                  Pending Challenges
                </h3>
                <div className="space-y-3">
                  {pendingChallenges.map((challenge) => {
                    const challenger = agents.find((a) => a.agentId === challenge.challengerAgentId);
                    const challenged = agents.find((a) => a.agentId === challenge.challengedAgentId);
                    const isMyChallenged = myAgents.some((a) => a.agentId === challenge.challengedAgentId);
                    return (
                      <div key={challenge.challengeId} className="brand-panel p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-retro-display text-[10px] text-white">
                            {challenger?.name ?? `#${challenge.challengerAgentId}`}
                          </span>
                          <span className="font-retro-display text-[8px] text-amber-400">VS</span>
                          <span className="font-retro-display text-[10px] text-white">
                            {challenged?.name ?? `#${challenge.challengedAgentId}`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-retro-display text-[8px] text-white/30">
                            Buy-in: {challenge.buyIn.toString()}
                          </span>
                          {isMyChallenged && (
                            <div className="flex gap-2">
                              <button className="px-3 py-1 font-retro-display text-[8px] bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-colors">
                                ACCEPT
                              </button>
                              <button className="px-3 py-1 font-retro-display text-[8px] bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors">
                                DECLINE
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Results */}
            <div className="brand-panel p-6">
              <h3 className="font-retro-display mb-4 text-xs text-[var(--secondary)] uppercase">
                Recent Results
              </h3>
              {completedMatches.length === 0 ? (
                <div className="font-retro-body text-sm text-white/40">No completed matches</div>
              ) : (
                <div className="space-y-2">
                  {completedMatches.slice(0, 5).map((match) => {
                    const winner = agents.find((a) => a.agentId === match.winnerAgentId);
                    return (
                      <div key={match.matchId} className="flex items-center justify-between py-1">
                        <span className="font-retro-display text-[9px] text-white/60">
                          #{match.matchId}
                        </span>
                        <span className="font-retro-display text-[9px] text-[var(--primary)]">
                          {winner?.name || `Agent #${match.winnerAgentId}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* LLM Reasoning */}
            {selectedMatch && (
              <LLMReasoningPanel matchId={selectedMatch.matchId} />
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t-4 border-black bg-black/40 px-8 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-4">
            <BrandWordmark href="/" compact />
            <span className="font-retro-display text-[10px] text-white/70">&copy; 2026</span>
          </div>
          <div className="flex items-center gap-2 font-retro-display text-[10px] uppercase text-white/65">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            ARENA: OPERATIONAL
          </div>
        </div>
      </footer>

      {showWalletSelector && (
        <WalletSelector onClose={() => setShowWalletSelector(false)} />
      )}

      {/* Register Agent Modal */}
      {showRegister && (
        <RegisterAgentModal onClose={() => setShowRegister(false)} />
      )}

      {/* Challenge Modal */}
      {challengeTarget !== null && (
        <ChallengeModal
          targetAgentId={challengeTarget}
          targetAgent={agents.find((a) => a.agentId === challengeTarget)}
          myAgents={myAgents}
          onClose={() => setChallengeTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Register Agent Modal ───

function RegisterAgentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState("gto");
  const [agentType, setAgentType] = useState("1"); // Bot
  const [description, setDescription] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="brand-panel w-full max-w-md p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-retro-display text-sm text-[var(--primary)] uppercase mb-6">
          Register Agent
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block font-retro-display text-[8px] text-white/40 uppercase mb-1">
              Agent Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={31}
              placeholder="e.g. AlphaPoker"
              className="w-full bg-black/50 border border-white/10 px-4 py-2 font-retro-display text-[10px] text-white placeholder:text-white/20 focus:border-[var(--primary)]/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-retro-display text-[8px] text-white/40 uppercase mb-1">
              Personality
            </label>
            <div className="flex gap-2">
              {[
                { value: "gto", label: "GTO", color: "text-yellow-400 border-yellow-400/30" },
                { value: "bluffer", label: "BLUFFER", color: "text-red-400 border-red-400/30" },
                { value: "conservative", label: "CONSERVATIVE", color: "text-blue-400 border-blue-400/30" },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPersonality(p.value)}
                  className={`flex-1 px-3 py-2 font-retro-display text-[8px] border transition-colors ${
                    personality === p.value
                      ? `${p.color} bg-white/10`
                      : "text-white/30 border-white/10 hover:border-white/20"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-retro-display text-[8px] text-white/40 uppercase mb-1">
              Type
            </label>
            <div className="flex gap-2">
              {[
                { value: "0", label: "HUMAN", icon: "👤" },
                { value: "1", label: "BOT", icon: "🤖" },
                { value: "2", label: "AI AGENT", icon: "🧠" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setAgentType(t.value)}
                  className={`flex-1 px-3 py-2 font-retro-display text-[8px] border transition-colors ${
                    agentType === t.value
                      ? "text-white border-white/30 bg-white/10"
                      : "text-white/30 border-white/10 hover:border-white/20"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-retro-display text-[8px] text-white/40 uppercase mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={31}
              placeholder="e.g. Balanced GTO player"
              className="w-full bg-black/50 border border-white/10 px-4 py-2 font-retro-display text-[10px] text-white placeholder:text-white/20 focus:border-[var(--primary)]/50 focus:outline-none"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 font-retro-display text-[10px] border border-white/10 text-white/40 hover:text-white/60 transition-colors"
            >
              CANCEL
            </button>
            <button
              disabled={!name}
              className="flex-1 px-4 py-2 font-retro-display text-[10px] brand-btn-cyan disabled:opacity-30"
            >
              REGISTER
            </button>
          </div>
        </div>

        <div className="mt-6 border-t border-white/5 pt-4">
          <div className="font-retro-display text-[7px] text-white/20 uppercase leading-relaxed">
            Registration creates an on-chain agent profile. Your wallet address becomes the owner.
            A keypair will be generated for your agent to execute game actions autonomously.
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Challenge Modal ───

import type { AgentProfile } from "@/hooks/useArena";

function ChallengeModal({
  targetAgentId,
  targetAgent,
  myAgents,
  onClose,
}: {
  targetAgentId: number;
  targetAgent?: AgentProfile;
  myAgents: AgentProfile[];
  onClose: () => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState(myAgents[0]?.agentId ?? 0);
  const [buyIn, setBuyIn] = useState("500");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="brand-panel w-full max-w-md p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-retro-display text-sm text-amber-400 uppercase mb-6">
          Challenge to Duel
        </h2>

        <div className="mb-6 text-center">
          <div className="font-retro-display text-[10px] text-white/40 uppercase mb-2">
            Target
          </div>
          <div className="font-retro-display text-lg text-white">
            {targetAgent?.name ?? `Agent #${targetAgentId}`}
          </div>
          <div className="font-retro-display text-xs text-[var(--primary)]">
            {targetAgent?.eloRating ?? "?"} ELO
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block font-retro-display text-[8px] text-white/40 uppercase mb-1">
              Your Agent
            </label>
            <div className="flex gap-2">
              {myAgents.map((a) => (
                <button
                  key={a.agentId}
                  onClick={() => setSelectedAgent(a.agentId)}
                  className={`flex-1 px-3 py-2 font-retro-display text-[8px] border transition-colors ${
                    selectedAgent === a.agentId
                      ? "text-white border-[var(--primary)]/50 bg-[var(--primary)]/10"
                      : "text-white/30 border-white/10"
                  }`}
                >
                  {a.name} ({a.eloRating})
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-retro-display text-[8px] text-white/40 uppercase mb-1">
              Buy-In
            </label>
            <input
              type="number"
              value={buyIn}
              onChange={(e) => setBuyIn(e.target.value)}
              min="100"
              className="w-full bg-black/50 border border-white/10 px-4 py-2 font-retro-display text-[10px] text-white focus:border-[var(--primary)]/50 focus:outline-none"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 font-retro-display text-[10px] border border-white/10 text-white/40 hover:text-white/60 transition-colors"
            >
              CANCEL
            </button>
            <button
              className="flex-1 px-4 py-2 font-retro-display text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
            >
              SEND CHALLENGE
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
