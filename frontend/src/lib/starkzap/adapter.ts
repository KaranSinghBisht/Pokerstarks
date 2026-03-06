/**
 * Adapts a StarkZap WalletInterface into a starknet.js@8 AccountInterface-compatible
 * duck type. StarkZap bundles starknet@9 internally, so we can't directly assign its
 * Account object — instead we wrap the essential methods.
 *
 * This follows the same pattern as `toInjectedAccount` in StarknetProvider.tsx.
 */
import type { AccountInterface } from "starknet";
import type { WalletInterface } from "starkzap";

interface ExecuteCallInput {
  contractAddress?: string;
  contract_address?: string;
  entrypoint?: string;
  entry_point?: string;
  calldata?: unknown[];
}

function normalizeCall(call: ExecuteCallInput) {
  const contractAddress = call.contract_address ?? call.contractAddress;
  const entrypoint = call.entry_point ?? call.entrypoint;
  if (!contractAddress || !entrypoint) return null;

  return {
    contractAddress,
    entrypoint,
    calldata: (call.calldata ?? []).map((item) =>
      typeof item === "bigint" ? item.toString() : String(item),
    ),
  };
}

export function toAccountInterface(wallet: WalletInterface): AccountInterface {
  const address = wallet.address.toString();

  const account = {
    address,
    async execute(
      callsInput: ExecuteCallInput | ExecuteCallInput[],
      _abis?: unknown,
      _details?: unknown,
    ) {
      const rawCalls = Array.isArray(callsInput) ? callsInput : [callsInput];
      const calls = rawCalls
        .map(normalizeCall)
        .filter((c): c is NonNullable<typeof c> => c !== null);

      if (calls.length === 0) {
        throw new Error("No valid calls provided for StarkZap execute.");
      }

      // StarkZap wallet.execute() accepts starknet.js Call[] format
      // (contractAddress, entrypoint, calldata) and returns a Tx object
      const tx = await wallet.execute(calls as never);
      // Return shape compatible with what the rest of the app expects
      return { transaction_hash: tx.hash };
    },
  };

  return account as unknown as AccountInterface;
}
