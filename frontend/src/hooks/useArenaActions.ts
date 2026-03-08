"use client";

import { useCallback } from "react";
import { CallData } from "starknet";
import { useStarknet } from "@/providers/StarknetProvider";
import { getSystemAddress } from "@/lib/contracts";

function stringToFelt(str: string): string {
  if (!str) return "0";
  let hex = "0x";
  for (let i = 0; i < str.length && i < 31; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

export function useArenaActions() {
  const { account } = useStarknet();
  const arenaAddress = getSystemAddress("arena");

  const registerAgent = useCallback(
    async (
      name: string,
      agentAddress: string,
      personality: string,
      agentType: number,
      description: string,
    ) => {
      if (!account) throw new Error("Wallet not connected");
      if (!arenaAddress) throw new Error("Arena contract address not configured");

      const result = await account.execute({
        contractAddress: arenaAddress,
        entrypoint: "register_agent",
        calldata: CallData.compile([
          stringToFelt(name),
          agentAddress,
          stringToFelt(personality),
          agentType,
          stringToFelt(description),
        ]),
      });
      return result;
    },
    [account, arenaAddress],
  );

  const challengeAgent = useCallback(
    async (challengerAgentId: number, challengedAgentId: number, buyIn: bigint | number) => {
      if (!account) throw new Error("Wallet not connected");
      if (!arenaAddress) throw new Error("Arena contract address not configured");

      const result = await account.execute({
        contractAddress: arenaAddress,
        entrypoint: "challenge_agent",
        calldata: CallData.compile([challengerAgentId, challengedAgentId, buyIn]),
      });
      return result;
    },
    [account, arenaAddress],
  );

  const acceptChallenge = useCallback(
    async (challengeId: number) => {
      if (!account) throw new Error("Wallet not connected");
      if (!arenaAddress) throw new Error("Arena contract address not configured");

      const result = await account.execute({
        contractAddress: arenaAddress,
        entrypoint: "accept_challenge",
        calldata: CallData.compile([challengeId]),
      });
      return result;
    },
    [account, arenaAddress],
  );

  const declineChallenge = useCallback(
    async (challengeId: number) => {
      if (!account) throw new Error("Wallet not connected");
      if (!arenaAddress) throw new Error("Arena contract address not configured");

      const result = await account.execute({
        contractAddress: arenaAddress,
        entrypoint: "decline_challenge",
        calldata: CallData.compile([challengeId]),
      });
      return result;
    },
    [account, arenaAddress],
  );

  return { registerAgent, challengeAgent, acceptChallenge, declineChallenge };
}
