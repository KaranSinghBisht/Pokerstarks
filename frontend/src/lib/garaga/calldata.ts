/**
 * Garaga calldata conversion.
 *
 * The on-chain Garaga verifier expects proofs in a specific format:
 *   full_proof_with_hints: Span<felt252>
 *
 * This includes the proof itself, MSM hints, and KZG pairing hints.
 * The hints require heavy computation (multi-scalar multiplication decomposition,
 * pairing check hints) that is done by Garaga's Python/Rust backend.
 *
 * Architecture:
 *   1. Frontend generates proof via bb.js Web Worker → raw proof bytes
 *   2. Frontend sends raw proof to a calldata generation endpoint
 *   3. Endpoint runs Garaga Python to compute hints → returns felt252[]
 *   4. Frontend submits the felt252[] calldata to the on-chain verifier
 *
 * For local development (Katana): run the Garaga script directly.
 * For production: a lightweight API endpoint or serverless function.
 */

// ───────────────────── Types ─────────────────────

export interface ProofWithInputs {
  proof: Uint8Array;
  publicInputs: string[];
}

export interface GaragaCalldata {
  /** The full calldata as felt252 strings, ready for the contract call */
  calldata: string[];
}

// ───────────────────── API-based Calldata Generation ─────────────────────

const GARAGA_API_URL =
  process.env.NEXT_PUBLIC_GARAGA_API_URL || "http://localhost:3001";

/**
 * Convert a bb.js proof to Garaga calldata by calling the hint generation API.
 *
 * The API endpoint runs Garaga's Python library to compute the MSM and KZG hints
 * that the on-chain verifier needs.
 */
export async function proofToGaragaCalldata(
  proofData: ProofWithInputs,
  circuitType: "shuffle" | "decrypt",
): Promise<GaragaCalldata> {
  // Convert proof bytes to hex for transport
  const proofHex = Array.from(proofData.proof)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const response = await fetch(`${GARAGA_API_URL}/generate-calldata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      circuit: circuitType,
      proof_hex: proofHex,
      public_inputs: proofData.publicInputs,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Garaga calldata generation failed: ${errorText}`);
  }

  const result = await response.json();
  return { calldata: result.calldata };
}

// ───────────────────── Fallback: Direct Proof Serialization ─────────────────────

/**
 * Fallback: Directly serialize the proof without MSM/KZG hints.
 *
 * WARNING: This will NOT work with the full Garaga verifier on Starknet.
 * It is provided for local testing only where the verifier is mocked.
 *
 * For a real deployment, you MUST use proofToGaragaCalldata() which
 * calls the Garaga Python backend for hint generation.
 */
export function proofToCalldataFallback(
  proofData: ProofWithInputs,
): string[] {
  const calldata: string[] = [];

  // Serialize public inputs as u256 (each split into 2 x u128 limbs)
  calldata.push(proofData.publicInputs.length.toString());
  for (const pi of proofData.publicInputs) {
    const value = BigInt(pi);
    const low = value & ((1n << 128n) - 1n);
    const high = value >> 128n;
    calldata.push(low.toString(), high.toString());
  }

  // Serialize proof bytes as felt252 chunks (31 bytes each)
  const BYTES_PER_FELT = 31;
  const proofBytes = proofData.proof;
  const numChunks = Math.ceil(proofBytes.length / BYTES_PER_FELT);
  calldata.push(numChunks.toString());
  for (let i = 0; i < proofBytes.length; i += BYTES_PER_FELT) {
    const chunk = proofBytes.slice(i, i + BYTES_PER_FELT);
    let value = 0n;
    for (const byte of chunk) {
      value = (value << 8n) | BigInt(byte);
    }
    calldata.push(value.toString());
  }

  return calldata;
}
