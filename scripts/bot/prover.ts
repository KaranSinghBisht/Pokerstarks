/**
 * ZK proof generation for Node.js (no Web Worker needed).
 *
 * Uses @noir-lang/noir_js for witness generation and @aztec/bb.js
 * for proof generation. Circuit JSON loaded from disk.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { log } from "./log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CIRCUITS_DIR = resolve(__dirname, "../../circuits");
const GARAGA_API_URL = process.env.GARAGA_API_URL ?? "http://localhost:3001";

// Lazy-loaded Noir + bb.js (heavy WASM modules)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Noir: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let UltraHonkBackend: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const circuits: Record<string, { noir: any; backend: any }> = {};

async function loadModules() {
  if (!Noir) {
    const noirMod = await import("@noir-lang/noir_js");
    Noir = noirMod.Noir;
  }
  if (!UltraHonkBackend) {
    const bbMod = await import("@aztec/bb.js");
    UltraHonkBackend = bbMod.UltraHonkBackend;
  }
}

async function getCircuit(circuitType: "shuffle" | "decrypt") {
  if (circuits[circuitType]) return circuits[circuitType];

  await loadModules();

  const jsonPath = resolve(
    CIRCUITS_DIR,
    `${circuitType}_proof/target/${circuitType}_proof.json`,
  );
  log.info(`Loading circuit: ${jsonPath}`);
  const circuitJson = JSON.parse(readFileSync(jsonPath, "utf-8"));

  const noir = new Noir(circuitJson);
  const backend = new UltraHonkBackend(circuitJson.bytecode);

  circuits[circuitType] = { noir, backend };
  return circuits[circuitType];
}

/**
 * Generate a ZK proof and convert to Garaga calldata.
 */
export async function generateProof(
  circuitType: "shuffle" | "decrypt",
  inputs: Record<string, unknown>,
): Promise<string[]> {
  const { noir, backend } = await getCircuit(circuitType);

  // 1. Generate witness
  log.info(`Generating ${circuitType} witness...`);
  const { witness } = await noir.execute(inputs);

  // 2. Generate proof
  log.info(`Generating ${circuitType} proof (this takes ~10-15s)...`);
  const proofResult = await backend.generateProof(witness);

  // 3. Convert to Garaga calldata via the hint server
  log.info("Converting to Garaga calldata...");
  const calldata = await toGaragaCalldata(
    proofResult.proof,
    proofResult.publicInputs,
    circuitType,
  );

  log.info(`${circuitType} proof ready (${calldata.length} calldata elements)`);
  return calldata;
}

/**
 * Send proof to Garaga server for hint generation.
 */
async function toGaragaCalldata(
  proof: Uint8Array,
  publicInputs: string[],
  circuitType: string,
): Promise<string[]> {
  const proofHex = Array.from(proof)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const response = await fetch(`${GARAGA_API_URL}/generate-calldata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      circuit: circuitType,
      proof_hex: proofHex,
      public_inputs: publicInputs,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Garaga calldata generation failed: ${errorText}`);
  }

  const result = await response.json();
  return result.calldata as string[];
}
