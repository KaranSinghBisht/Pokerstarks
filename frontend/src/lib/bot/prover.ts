/**
 * ZK proof generation for server-side bots.
 * Port of scripts/bot/prover.ts — uses dynamic imports for WASM modules.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { log } from "./log";

const GARAGA_API_URL =
  process.env.NEXT_PUBLIC_GARAGA_API_URL || "http://localhost:3001";

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

function getCircuitsDir(): string {
  // In Next.js, process.cwd() is the frontend/ directory.
  // Circuits are at ../circuits/ relative to that.
  return resolve(process.cwd(), "../circuits");
}

async function getCircuit(circuitType: "shuffle" | "decrypt") {
  if (circuits[circuitType]) return circuits[circuitType];

  await loadModules();

  const jsonPath = resolve(
    getCircuitsDir(),
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

  log.info(`Generating ${circuitType} witness...`);
  const { witness } = await noir.execute(inputs);

  log.info(`Generating ${circuitType} proof (this takes ~10-15s)...`);
  const proofResult = await backend.generateProof(witness);

  log.info("Converting to Garaga calldata...");
  const calldata = await toGaragaCalldata(
    proofResult.proof,
    proofResult.publicInputs,
    circuitType,
  );

  log.info(`${circuitType} proof ready (${calldata.length} calldata elements)`);
  return calldata;
}

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
