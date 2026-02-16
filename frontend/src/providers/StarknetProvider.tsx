"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import type { AccountInterface } from "starknet";
import Controller from "@cartridge/controller";
import type { SessionPolicies } from "@cartridge/presets";
import { RPC_URL } from "@/lib/dojo-config";
import { getSystemAddress } from "@/lib/contracts";

interface StarknetContextType {
  address: string | null;
  account: AccountInterface | null;
  isConnected: boolean;
  connecting: boolean;
  username: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const StarknetContext = createContext<StarknetContextType>({
  address: null,
  account: null,
  isConnected: false,
  connecting: false,
  username: null,
  error: null,
  connect: async () => {},
  disconnect: () => {},
});

export function useStarknet() {
  return useContext(StarknetContext);
}

const LOBBY_ADDRESS = getSystemAddress("lobby");
const GAME_SETUP_ADDRESS = getSystemAddress("game_setup");
const SHUFFLE_ADDRESS = getSystemAddress("shuffle");
const DEALING_ADDRESS = getSystemAddress("dealing");
const BETTING_ADDRESS = getSystemAddress("betting");
const SHOWDOWN_ADDRESS = getSystemAddress("showdown");
const SETTLE_ADDRESS = getSystemAddress("settle");
const CHAT_ADDRESS = getSystemAddress("chat");
type WalletSource = "injected" | "controller";

type StarknetRequest =
  | {
      type: "wallet_requestAccounts";
      params?: { silent_mode?: boolean };
    }
  | {
      type: "wallet_addInvokeTransaction";
      params: {
        calls: Array<{
          contract_address: string;
          entry_point: string;
          calldata?: string[];
        }>;
      };
    };

interface InjectedWallet {
  id?: string;
  name?: string;
  account?: AccountInterface;
  selectedAddress?: string;
  request: (request: StarknetRequest) => Promise<unknown>;
  enable?: (options?: unknown) => Promise<unknown>;
  on?: (event: string, listener: (accounts?: string[]) => void) => void;
  off?: (event: string, listener: (accounts?: string[]) => void) => void;
}

interface ExecuteCallInput {
  contractAddress?: string;
  contract_address?: string;
  entrypoint?: string;
  entry_point?: string;
  calldata?: unknown[];
}

// Session policies covering all game system entrypoints
const SESSION_POLICIES: SessionPolicies = {
  contracts: {
    ...(LOBBY_ADDRESS
      ? {
          [LOBBY_ADDRESS]: {
            methods: [
              { entrypoint: "create_table" },
              { entrypoint: "join_table" },
              { entrypoint: "leave_table" },
              { entrypoint: "set_ready" },
            ],
          },
        }
      : {}),
    ...(GAME_SETUP_ADDRESS
      ? {
          [GAME_SETUP_ADDRESS]: {
            methods: [
              { entrypoint: "start_hand" },
              { entrypoint: "submit_public_key" },
              { entrypoint: "submit_aggregate_key" },
              { entrypoint: "submit_initial_deck_hash" },
              { entrypoint: "submit_initial_deck" },
            ],
          },
        }
      : {}),
    ...(SHUFFLE_ADDRESS
      ? {
          [SHUFFLE_ADDRESS]: {
            methods: [
              { entrypoint: "submit_shuffle" },
            ],
          },
        }
      : {}),
    ...(DEALING_ADDRESS
      ? {
          [DEALING_ADDRESS]: {
            methods: [
              { entrypoint: "submit_reveal_token" },
              { entrypoint: "submit_reveal_tokens_batch" },
            ],
          },
        }
      : {}),
    ...(BETTING_ADDRESS
      ? {
          [BETTING_ADDRESS]: {
            methods: [
              { entrypoint: "player_action" },
            ],
          },
        }
      : {}),
    ...(SHOWDOWN_ADDRESS
      ? {
          [SHOWDOWN_ADDRESS]: {
            methods: [
              { entrypoint: "submit_card_decryption" },
              { entrypoint: "compute_winner" },
            ],
          },
        }
      : {}),
    ...(SETTLE_ADDRESS
      ? {
          [SETTLE_ADDRESS]: {
            methods: [
              { entrypoint: "distribute_pot" },
            ],
          },
        }
      : {}),
    ...(CHAT_ADDRESS
      ? {
          [CHAT_ADDRESS]: {
            methods: [{ entrypoint: "send_message" }, { entrypoint: "send_emote" }],
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
      rpcUrl: RPC_URL,
      policies: SESSION_POLICIES,
    });
  }
  return controllerInstance;
}

function getInjectedWallets(): InjectedWallet[] {
  if (typeof window === "undefined") return [];
  const candidates = [
    (window as unknown as { starknet?: InjectedWallet }).starknet,
    (window as unknown as { starknet_braavos?: InjectedWallet }).starknet_braavos,
    (window as unknown as { starknet_argentX?: InjectedWallet }).starknet_argentX,
  ].filter(
    (wallet): wallet is InjectedWallet =>
      !!wallet &&
      (typeof wallet.request === "function" || typeof wallet.enable === "function"),
  );

  // De-dupe by wallet id/name to avoid trying the same injected object twice.
  const seen = new Set<string>();
  return candidates.filter((wallet) => {
    const key = `${wallet.id ?? ""}:${wallet.name ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeExecuteCall(call: ExecuteCallInput) {
  const contractAddress = call.contract_address ?? call.contractAddress;
  const entrypoint = call.entry_point ?? call.entrypoint;
  if (!contractAddress || !entrypoint) return null;

  return {
    contract_address: contractAddress,
    entry_point: entrypoint,
    calldata: (call.calldata ?? []).map((item) =>
      typeof item === "bigint" ? item.toString() : String(item),
    ),
  };
}

function toInjectedAccount(wallet: InjectedWallet, address: string): AccountInterface {
  const account = {
    address,
    async execute(callsInput: ExecuteCallInput | ExecuteCallInput[]) {
      const calls = (Array.isArray(callsInput) ? callsInput : [callsInput]).reduce<
        Array<{ contract_address: string; entry_point: string; calldata?: string[] }>
      >((acc, call) => {
        const normalized = normalizeExecuteCall(call);
        if (normalized) acc.push(normalized);
        return acc;
      }, []);

      if (calls.length === 0) {
        throw new Error("Invalid transaction calls for wallet execute.");
      }

      const result = await wallet.request({
        type: "wallet_addInvokeTransaction",
        params: { calls },
      });
      return result;
    },
  };

  return account as unknown as AccountInterface;
}

async function connectInjectedWallet(): Promise<{
  source: WalletSource;
  account: AccountInterface;
  address: string;
  username: string | null;
} | null> {
  const wallets = getInjectedWallets();
  for (const wallet of wallets) {
    try {
      let address: string | null = null;
      let account: AccountInterface | null = null;

      if (typeof wallet.request === "function") {
        const response = await wallet.request({
          type: "wallet_requestAccounts",
          params: { silent_mode: false },
        });
        const accounts = Array.isArray(response) ? response : [];
        if (accounts.length > 0) {
          address = String(accounts[0]);
          account = toInjectedAccount(wallet, address);
        }
      }

      if (!address && typeof wallet.enable === "function") {
        const response = await wallet.enable({ showModal: true });
        const accounts = Array.isArray(response) ? response : [];
        const connectedAccount = wallet.account ?? null;
        const resolvedAddress =
          connectedAccount?.address ??
          wallet.selectedAddress ??
          (accounts.length > 0 ? String(accounts[0]) : null);
        if (resolvedAddress) {
          address = resolvedAddress;
          account =
            connectedAccount ??
            (typeof wallet.request === "function"
              ? toInjectedAccount(wallet, resolvedAddress)
              : null);
        }
      }

      if (!address || !account) continue;
      return {
        source: "injected",
        account,
        address,
        username: wallet.name ?? null,
      };
    } catch {
      // Try next injected wallet.
    }
  }

  return null;
}

export function StarknetProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountRef = useRef<AccountInterface | null>(null);
  const sourceRef = useRef<WalletSource | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const injected = await connectInjectedWallet();
      if (injected) {
        accountRef.current = injected.account;
        sourceRef.current = injected.source;
        setAddress(injected.address);
        setUsername(injected.username);
        return;
      }

      const controller = getController();
      const account = await controller.connect();
      if (account) {
        accountRef.current = account as unknown as AccountInterface;
        sourceRef.current = "controller";
        setAddress(account.address);
        // Try to get username
        try {
          const name = await controller.username();
          if (name) setUsername(name);
        } catch {
          // Username fetch is optional
        }
      } else {
        setError("No wallet connected. Unlock Braavos/ArgentX or try Cartridge again.");
      }
    } catch (err) {
      console.error("Cartridge Controller connection failed:", err);
      setError(err instanceof Error ? err.message : "Wallet connection failed.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      if (sourceRef.current === "controller") {
        const controller = getController();
        await controller.disconnect();
      }
      setAddress(null);
      setUsername(null);
      setError(null);
      accountRef.current = null;
      sourceRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet disconnect failed.");
    }
  }, []);

  return (
    <StarknetContext.Provider
      value={{
        address,
        account: accountRef.current,
        isConnected: !!address,
        connecting,
        username,
        error,
        connect,
        disconnect,
      }}
    >
      {children}
    </StarknetContext.Provider>
  );
}
