"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import type { AccountInterface } from "starknet";
import { RpcProvider } from "starknet";
import Controller from "@cartridge/controller";
import type { SessionPolicies } from "@cartridge/presets";
import { RPC_URL } from "@/lib/dojo-config";
import { getSystemAddress } from "@/lib/contracts";
import { TONGO_STRK_ADDRESS, STRK_TOKEN_ADDRESS, CHIP_TOKEN_ADDRESS } from "@/lib/constants";

type WalletSource = "injected" | "controller" | "starkzap";

interface StarknetContextType {
  address: string | null;
  account: AccountInterface | null;
  isConnected: boolean;
  connecting: boolean;
  username: string | null;
  error: string | null;
  walletSource: WalletSource | null;
  connect: () => Promise<void>;
  connectController: () => Promise<void>;
  connectInjected: () => Promise<void>;
  connectWithStarkZap: () => Promise<void>;
  disconnect: () => void;
}

const StarknetContext = createContext<StarknetContextType>({
  address: null,
  account: null,
  isConnected: false,
  connecting: false,
  username: null,
  error: null,
  walletSource: null,
  connect: async () => {},
  connectController: async () => {},
  connectInjected: async () => {},
  connectWithStarkZap: async () => {},
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
const TIMEOUT_ADDRESS = getSystemAddress("timeout");
const CHAT_ADDRESS = getSystemAddress("chat");
const ARENA_ADDRESS = getSystemAddress("arena");
const EGS_ADDRESS = getSystemAddress("egs");

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
    }
  | {
      type: "wallet_requestChainId";
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
    ...(TIMEOUT_ADDRESS
      ? {
          [TIMEOUT_ADDRESS]: {
            methods: [
              { entrypoint: "enforce_timeout" },
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
    ...(ARENA_ADDRESS
      ? {
          [ARENA_ADDRESS]: {
            methods: [
              { entrypoint: "register_agent" },
              { entrypoint: "challenge_agent" },
              { entrypoint: "accept_challenge" },
              { entrypoint: "decline_challenge" },
              { entrypoint: "deposit_chips" },
              { entrypoint: "withdraw_chips" },
              { entrypoint: "update_agent_config" },
              { entrypoint: "deactivate_agent" },
              { entrypoint: "set_erc8004_identity" },
              { entrypoint: "cancel_stale_match" },
              { entrypoint: "set_operator" },
            ],
          },
        }
      : {}),
    ...(EGS_ADDRESS
      ? {
          [EGS_ADDRESS]: {
            methods: [
              { entrypoint: "mint" },
              { entrypoint: "update_score" },
              { entrypoint: "complete_session" },
            ],
          },
        }
      : {}),
    // Tongo confidential token + STRK ERC20 approval
    ...(TONGO_STRK_ADDRESS
      ? {
          [TONGO_STRK_ADDRESS]: {
            methods: [
              { entrypoint: "fund" },
              { entrypoint: "withdraw" },
              { entrypoint: "transfer" },
              { entrypoint: "rollover" },
              { entrypoint: "ragequit" },
            ],
          },
        }
      : {}),
    ...(STRK_TOKEN_ADDRESS
      ? {
          [STRK_TOKEN_ADDRESS]: {
            methods: [
              { entrypoint: "approve" },
              { entrypoint: "transfer" },
            ],
          },
        }
      : {}),
    // CHIP token (ERC20 for in-game chips)
    ...(CHIP_TOKEN_ADDRESS
      ? {
          [CHIP_TOKEN_ADDRESS]: {
            methods: [
              { entrypoint: "approve" },
              { entrypoint: "transfer" },
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
      rpcUrl: RPC_URL,
      policies: SESSION_POLICIES,
    });
  }
  return controllerInstance;
}

// ─── Chain validation helpers ───
let cachedExpectedChainId: string | null = null;

async function getExpectedChainId(): Promise<string> {
  if (cachedExpectedChainId) return cachedExpectedChainId;
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  cachedExpectedChainId = await provider.getChainId();
  return cachedExpectedChainId;
}

async function getWalletChainId(wallet: InjectedWallet): Promise<string | null> {
  try {
    const result = await wallet.request({ type: "wallet_requestChainId" });
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
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

function isRateLimitedRpcError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("too many requests") ||
    normalized.includes("onfinality") ||
    normalized.includes("tip statistics") ||
    normalized.includes("-32029")
  );
}

function normalizeCallsForWalletRequest(callsInput: ExecuteCallInput | ExecuteCallInput[]) {
  return (Array.isArray(callsInput) ? callsInput : [callsInput]).reduce<
    Array<{ contract_address: string; entry_point: string; calldata?: string[] }>
  >((acc, call) => {
    const normalized = normalizeExecuteCall(call);
    if (normalized) acc.push(normalized);
    return acc;
  }, []);
}

function toInjectedAccount(wallet: InjectedWallet, address: string): AccountInterface {
  // Request-based execute path used for fallback and wallets without `.account`.
  const executeViaWalletRequest = async (
    callsInput: ExecuteCallInput | ExecuteCallInput[],
  ) => {
    const calls = normalizeCallsForWalletRequest(callsInput);
    if (calls.length === 0) {
      throw new Error("Invalid transaction calls for wallet execute.");
    }
    return wallet.request({
      type: "wallet_addInvokeTransaction",
      params: { calls },
    });
  };

  const account = {
    address,
    async execute(
      callsInput: ExecuteCallInput | ExecuteCallInput[],
      _abis?: unknown,
      _details?: unknown,
    ) {
      // Prefer native injected account when available.
      const nativeAccount = wallet.account;
      if (nativeAccount && typeof nativeAccount.execute === "function") {
        try {
          return await nativeAccount.execute(callsInput as never);
        } catch (err) {
          // Some wallet/provider combos rate-limit fee-tip analysis on shared
          // RPCs (often showing OnFinality -32029). Retry via wallet request API.
          if (!isRateLimitedRpcError(err)) {
            throw err;
          }
          console.warn(
            "[wallet] Native execute hit RPC rate limit, retrying via wallet_addInvokeTransaction.",
          );
        }
      }

      return executeViaWalletRequest(callsInput);
    },
  };

  return account as unknown as AccountInterface;
}

async function connectInjectedWallet(): Promise<{
  source: WalletSource;
  account: AccountInterface;
  address: string;
  username: string | null;
  chainMismatch?: boolean;
} | null> {
  const wallets = getInjectedWallets();
  let anyChainMismatch = false;

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

      // Validate wallet chain matches app's expected chain
      if (typeof wallet.request === "function") {
        try {
          const [walletChain, expectedChain] = await Promise.all([
            getWalletChainId(wallet),
            getExpectedChainId(),
          ]);
          if (walletChain && walletChain !== expectedChain) {
            console.warn(
              `Wallet ${wallet.name ?? "unknown"} is on chain ${walletChain}, expected ${expectedChain}. Skipping.`,
            );
            anyChainMismatch = true;
            continue;
          }
        } catch {
          // Chain check is best-effort; proceed if it fails
        }
      }

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

  // Return a sentinel so the caller knows a chain mismatch occurred
  if (anyChainMismatch) {
    return { source: "injected", account: null as unknown as AccountInterface, address: "", username: null, chainMismatch: true };
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
  // Keep a reference to the StarkZap wallet for cleanup on disconnect
  const starkZapWalletRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const injected = await connectInjectedWallet();
      if (injected && !injected.chainMismatch && injected.address) {
        accountRef.current = injected.account;
        sourceRef.current = injected.source;
        setAddress(injected.address);
        setUsername(injected.username);
        return;
      }

      const hadChainMismatch = injected?.chainMismatch === true;

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
      } else if (hadChainMismatch) {
        setError("Your wallet is on the wrong network. Switch to Sepolia in your wallet settings.");
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

  const connectController = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const controller = getController();
      const account = await controller.connect();
      if (account) {
        accountRef.current = account as unknown as AccountInterface;
        sourceRef.current = "controller";
        setAddress(account.address);
        try {
          const name = await controller.username();
          if (name) setUsername(name);
        } catch {
          // Username fetch is optional
        }
      } else {
        setError("Cartridge Controller connection was cancelled.");
      }
    } catch (err) {
      console.error("Cartridge Controller connection failed:", err);
      setError(err instanceof Error ? err.message : "Cartridge connection failed.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectInjected = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const injected = await connectInjectedWallet();
      if (injected && !injected.chainMismatch && injected.address) {
        accountRef.current = injected.account;
        sourceRef.current = injected.source;
        setAddress(injected.address);
        setUsername(injected.username);
      } else if (injected?.chainMismatch) {
        setError("Your wallet is on the wrong network. Switch to Sepolia in your wallet settings.");
      } else {
        setError("No browser wallet found. Install ArgentX or Braavos.");
      }
    } catch (err) {
      console.error("Injected wallet connection failed:", err);
      setError(err instanceof Error ? err.message : "Browser wallet connection failed.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectWithStarkZap = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { getStarkZap } = await import("@/lib/starkzap");
      const { OnboardStrategy } = await import("starkzap");
      const { toAccountInterface } = await import("@/lib/starkzap/adapter");

      const sdk = getStarkZap();
      const origin = typeof window !== "undefined" ? window.location.origin : "";

      // Fetch a short-lived auth token for wallet API calls
      const tokenRes = await fetch(`${origin}/api/wallet/token`, { method: "POST" });
      const { token: apiToken } = tokenRes.ok
        ? await tokenRes.json()
        : { token: "" };

      const { wallet } = await sdk.onboard({
        strategy: OnboardStrategy.Privy,
        privy: {
          resolve: async () => {
            const walletRes = await fetch(`${origin}/api/wallet/starknet`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(apiToken ? { "x-api-token": apiToken } : {}),
              },
            });
            if (!walletRes.ok) {
              const err = await walletRes.json().catch(() => ({}));
              throw new Error(err.error || "Wallet creation failed");
            }
            const { wallet: w } = await walletRes.json();
            return {
              walletId: w.id,
              publicKey: w.publicKey,
              serverUrl: `${origin}/api/wallet/sign`,
              serverHeaders: apiToken ? { "x-api-token": apiToken } : {},
            };
          },
        },
        accountPreset: "argentXV050",
        deploy: "if_needed",
      });

      const adapted = toAccountInterface(wallet);
      accountRef.current = adapted;
      sourceRef.current = "starkzap";
      starkZapWalletRef.current = wallet;
      setAddress(wallet.address.toString());
      setUsername("Email User");
    } catch (err) {
      console.error("StarkZap connection failed:", err);
      setError(err instanceof Error ? err.message : "StarkZap connection failed.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      if (sourceRef.current === "controller") {
        const controller = getController();
        await controller.disconnect();
      } else if (sourceRef.current === "starkzap" && starkZapWalletRef.current) {
        await starkZapWalletRef.current.disconnect().catch(() => {});
        starkZapWalletRef.current = null;
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
        walletSource: sourceRef.current as WalletSource | null,
        connect,
        connectController,
        connectInjected,
        connectWithStarkZap,
        disconnect,
      }}
    >
      {children}
    </StarknetContext.Provider>
  );
}
