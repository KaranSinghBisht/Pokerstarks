"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import type { AccountInterface } from "starknet";

interface StarknetContextType {
  address: string | null;
  account: AccountInterface | null;
  isConnected: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const StarknetContext = createContext<StarknetContextType>({
  address: null,
  account: null,
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
  const accountRef = useRef<AccountInterface | null>(null);

  const connect = useCallback(async () => {
    // TODO: Replace with Cartridge Controller connection
    // When Cartridge Controller is integrated, it returns an AccountInterface:
    //   const controller = new Controller({ rpc, policies });
    //   const account = await controller.connect();
    //   accountRef.current = account;
    //   setAddress(account.address);
    setConnecting(true);
    try {
      // Mock connection for now — no real AccountInterface available
      // In production, accountRef.current would be set to the Cartridge account
      setAddress("0x1234567890abcdef1234567890abcdef12345678");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    accountRef.current = null;
  }, []);

  return (
    <StarknetContext.Provider
      value={{
        address,
        account: accountRef.current,
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
