import { NextResponse } from "next/server";
import { Account, RpcProvider, CallData } from "starknet";

const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
const TORII_PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_TORII_RPC_URL || "";
const CARTRIDGE_SEPOLIA = "https://api.cartridge.gg/x/starknet/sepolia";

const RPC_URL =
  process.env.CHIP_FAUCET_RPC_URL ||
  process.env.TORII_RPC_URL ||
  ((PUBLIC_RPC_URL && PUBLIC_RPC_URL !== CARTRIDGE_SEPOLIA ? PUBLIC_RPC_URL : "") ||
    TORII_PUBLIC_RPC_URL ||
    PUBLIC_RPC_URL ||
    "http://localhost:5050");

const CHIP_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_CHIP_TOKEN_ADDRESS || "";
const DEPLOYER_PRIVATE_KEY = process.env.CHIP_DEPLOYER_PRIVATE_KEY || "";
const DEPLOYER_ADDRESS = process.env.CHIP_DEPLOYER_ADDRESS || "";

const FAUCET_AMOUNT = 10_000; // 10k CHIP per claim
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour per address
const GLOBAL_RATE_LIMIT_MS = 2_000; // 2s between any claims (anti-burst)
const MAX_TRACKED_ADDRESSES = 10_000; // cap the map to prevent unbounded growth

// In-memory rate limit map (address → last claim timestamp)
const claimHistory = new Map<string, number>();
let lastGlobalClaim = 0;

/** Evict oldest entries when the map exceeds the cap */
function evictIfNeeded() {
  if (claimHistory.size <= MAX_TRACKED_ADDRESSES) return;
  // Remove the oldest 20% of entries
  const entries = [...claimHistory.entries()].sort((a, b) => a[1] - b[1]);
  const toRemove = Math.floor(entries.length * 0.2);
  for (let i = 0; i < toRemove; i++) {
    claimHistory.delete(entries[i][0]);
  }
}

function getDeployerAccount(): Account {
  if (!DEPLOYER_PRIVATE_KEY || !DEPLOYER_ADDRESS) {
    throw new Error("Faucet deployer credentials not configured");
  }
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  return new Account({ provider, address: DEPLOYER_ADDRESS, signer: DEPLOYER_PRIVATE_KEY });
}

export async function POST(request: Request) {
  if (!CHIP_TOKEN_ADDRESS) {
    return NextResponse.json(
      { error: "CHIP token not configured" },
      { status: 503 },
    );
  }

  let body: { address?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const recipientAddress = body.address;
  if (
    !recipientAddress ||
    typeof recipientAddress !== "string" ||
    !/^0x[0-9a-fA-F]+$/.test(recipientAddress)
  ) {
    return NextResponse.json(
      { error: "Missing or invalid 'address' in request body" },
      { status: 400 },
    );
  }

  // Global burst rate limit
  const now = Date.now();
  if (now - lastGlobalClaim < GLOBAL_RATE_LIMIT_MS) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few seconds." },
      { status: 429 },
    );
  }

  // Per-address rate limit
  const normalizedAddr = recipientAddress.toLowerCase();
  const lastClaim = claimHistory.get(normalizedAddr);
  if (lastClaim && now - lastClaim < RATE_LIMIT_MS) {
    const remainingMs = RATE_LIMIT_MS - (now - lastClaim);
    const remainingMin = Math.ceil(remainingMs / 60_000);
    return NextResponse.json(
      { error: `Rate limited. Try again in ${remainingMin} minute(s).` },
      { status: 429 },
    );
  }

  // Lock rate limit BEFORE the async transfer to prevent concurrent bypass.
  // If transfer fails, we roll back.
  claimHistory.set(normalizedAddr, now);
  lastGlobalClaim = now;
  evictIfNeeded();

  try {
    const deployer = getDeployerAccount();
    const provider = new RpcProvider({ nodeUrl: RPC_URL });

    // Transfer CHIP from deployer to recipient
    const tx = await deployer.execute({
      contractAddress: CHIP_TOKEN_ADDRESS,
      entrypoint: "transfer",
      calldata: CallData.compile([recipientAddress, FAUCET_AMOUNT, 0]), // u256 = (low, high)
    });

    // P2 FIX: Wait for on-chain confirmation AND check execution status.
    // waitForTransaction resolves for ACCEPTED_ON_L2 even if execution_status
    // is "REVERTED", so we must explicitly check the receipt.
    try {
      const receipt = await provider.waitForTransaction(tx.transaction_hash, {
        retryInterval: 3000,
        successStates: ["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"],
      });

      // Check execution_status — tx can reach finality but still revert
      const isReverted =
        ("execution_status" in receipt &&
          (receipt as Record<string, unknown>).execution_status === "REVERTED") ||
        (typeof (receipt as Record<string, unknown>).isReverted === "function" &&
          (receipt as { isReverted: () => boolean }).isReverted());

      if (isReverted) {
        claimHistory.delete(normalizedAddr);
        console.error("Faucet tx reverted on-chain:", tx.transaction_hash);
        return NextResponse.json(
          {
            error: "Transfer reverted on-chain. Please retry.",
            transactionHash: tx.transaction_hash,
          },
          { status: 500 },
        );
      }
    } catch (waitErr) {
      // Tx may have failed to confirm — roll back rate limit so user can retry
      claimHistory.delete(normalizedAddr);
      console.error("Faucet tx failed confirmation:", waitErr);
      return NextResponse.json(
        {
          error: "Transfer submitted but not confirmed. Please retry.",
          transactionHash: tx.transaction_hash,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      amount: FAUCET_AMOUNT,
      transactionHash: tx.transaction_hash,
    });
  } catch (err) {
    // Roll back rate limit on failure so the user can retry
    claimHistory.delete(normalizedAddr);
    console.error("Faucet transfer error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transfer failed" },
      { status: 500 },
    );
  }
}
