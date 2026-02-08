"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import type { AccountInterface } from "starknet";
import Controller from "@cartridge/controller";
import type { SessionPolicies } from "@cartridge/presets";
import { TORII_RPC_URL } from "@/lib/dojo-config";

interface StarknetContextType {
  address: string | null;
  account: AccountInterface | null;
  isConnected: boolean;
  connecting: boolean;
  username: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const StarknetContext = createContext<StarknetContextType>({
  address: null,
  account: null,
  isConnected: false,
  connecting: false,
  username: null,
  connect: async () => {},
  disconnect: () => {},
});

export function useStarknet() {
  return useContext(StarknetContext);
}

// Session policies covering all game system entrypoints
const SESSION_POLICIES: SessionPolicies = {
  contracts: {
    ...(process.env.NEXT_PUBLIC_LOBBY_ADDRESS
      ? {
          [process.env.NEXT_PUBLIC_LOBBY_ADDRESS]: {
            methods: [
              { entrypoint: "create_table" },
              { entrypoint: "join_table" },
              { entrypoint: "leave_table" },
              { entrypoint: "set_ready" },
            ],
          },
        }
      : {}),
    ...(process.env.NEXT_PUBLIC_GAME_SETUP_ADDRESS
      ? {
          [process.env.NEXT_PUBLIC_GAME_SETUP_ADDRESS]: {
            methods: [
              { entrypoint: "start_hand" },
              { entrypoint: "submit_public_key" },
              { entrypoint: "submit_aggregate_key" },
              { entrypoint: "submit_initial_deck" },
            ],
          },
        }
      : {}),
    ...(process.env.NEXT_PUBLIC_SHUFFLE_ADDRESS
      ? {
          [process.env.NEXT_PUBLIC_SHUFFLE_ADDRESS]: {
            methods: [
              { entrypoint: "submit_shuffle" },
            ],
          },
        }
      : {}),
    ...(process.env.NEXT_PUBLIC_DEALING_ADDRESS
      ? {
          [process.env.NEXT_PUBLIC_DEALING_ADDRESS]: {
            methods: [
              { entrypoint: "submit_reveal_token" },
              { entrypoint: "submit_reveal_tokens_batch" },
            ],
          },
        }
      : {}),
    ...(process.env.NEXT_PUBLIC_BETTING_ADDRESS
      ? {
          [process.env.NEXT_PUBLIC_BETTING_ADDRESS]: {
            methods: [
              { entrypoint: "player_action" },
            ],
          },
        }
      : {}),
    ...(process.env.NEXT_PUBLIC_SHOWDOWN_ADDRESS
      ? {
          [process.env.NEXT_PUBLIC_SHOWDOWN_ADDRESS]: {
            methods: [
              { entrypoint: "reveal_hand" },
              { entrypoint: "set_community_cards" },
              { entrypoint: "compute_winner" },
            ],
          },
        }
      : {}),
    ...(process.env.NEXT_PUBLIC_SETTLE_ADDRESS
      ? {
          [process.env.NEXT_PUBLIC_SETTLE_ADDRESS]: {
            methods: [
              { entrypoint: "distribute_pot" },
            ],
          },
        }
      : {}),
  },
};

// Initialize controller (singleton)
let controllerInstance: Controller | null = null;

function getController(): Controller {
  if (!controllerInstance) {
    controllerInstance = new Controller({
      rpcUrl: TORII_RPC_URL,
      policies: SESSION_POLICIES,
    });
  }
  return controllerInstance;
}

export function StarknetProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const accountRef = useRef<AccountInterface | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const controller = getController();
      const account = await controller.connect();
      if (account) {
        accountRef.current = account as unknown as AccountInterface;
        setAddress(account.address);
        // Try to get username
        try {
          const name = await controller.username();
          if (name) setUsername(name);
        } catch {
          // Username fetch is optional
        }
      }
    } catch (err) {
      console.error("Cartridge Controller connection failed:", err);
      // Fallback: allow mock connection for development
      if (process.env.NODE_ENV === "development") {
        console.warn("Using mock connection for development");
        setAddress("0x1234567890abcdef1234567890abcdef12345678");
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const controller = getController();
    await controller.disconnect();
    setAddress(null);
    setUsername(null);
    accountRef.current = null;
  }, []);

  return (
    <StarknetContext.Provider
      value={{
        address,
        account: accountRef.current,
        isConnected: !!address,
        connecting,
        username,
        connect,
        disconnect,
      }}
    >
      {children}
    </StarknetContext.Provider>
  );
}
