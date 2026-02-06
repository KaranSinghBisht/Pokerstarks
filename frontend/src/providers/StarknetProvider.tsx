"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface StarknetContextType {
  address: string | null;
  isConnected: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const StarknetContext = createContext<StarknetContextType>({
  address: null,
  isConnected: false,
  connecting: false,
  connect: async () => {},
  disconnect: () => {},
});

export function useStarknet() {
  return useContext(StarknetContext);
}

export function StarknetProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    // TODO: Replace with Cartridge Controller connection
    // import { CartridgeSessionProvider } from "@cartridge/controller";
    // const controller = new Controller({
    //   rpc: TORII_RPC_URL,
    //   policies: [
    //     { target: WORLD_ADDRESS, method: "create_table" },
    //     { target: WORLD_ADDRESS, method: "join_table" },
    //     { target: WORLD_ADDRESS, method: "set_ready" },
    //     { target: WORLD_ADDRESS, method: "player_action" },
    //     { target: WORLD_ADDRESS, method: "submit_public_key" },
    //     { target: WORLD_ADDRESS, method: "submit_shuffle" },
    //     { target: WORLD_ADDRESS, method: "submit_reveal_token" },
    //   ],
    // });
    setConnecting(true);
    try {
      // Mock connection for now
      setAddress("0x1234567890abcdef1234567890abcdef12345678");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, []);

  return (
    <StarknetContext.Provider
      value={{
        address,
        isConnected: !!address,
        connecting,
        connect,
        disconnect,
      }}
    >
      {children}
    </StarknetContext.Provider>
  );
}
