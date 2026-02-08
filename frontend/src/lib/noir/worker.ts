/**
 * Noir proof generation Web Worker.
 *
 * Runs proof generation off the main thread to avoid blocking the UI.
 * Supports both shuffle and decrypt circuit types.
 *
 * Message protocol:
 *   → { type: 'init', circuit: 'shuffle' | 'decrypt' }
 *   → { type: 'prove', inputs: Record<string, unknown> }
 *   ← { type: 'ready' }
 *   ← { type: 'progress', value: number }
 *   ← { type: 'proof_ready', proof: Uint8Array, publicInputs: string[] }
 *   ← { type: 'error', message: string }
 */

// Note: @noir-lang/noir_js and @aztec/bb.js are loaded dynamically
// to avoid import issues in the worker context.

interface InitMessage {
  type: "init";
  circuit: "shuffle" | "decrypt";
}

interface ProveMessage {
  type: "prove";
  inputs: Record<string, unknown>;
}

type WorkerMessage = InitMessage | ProveMessage;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let noir: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let backend: any = null;
let circuitType: "shuffle" | "decrypt" | null = null;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  try {
    if (msg.type === "init") {
      circuitType = msg.circuit;
      self.postMessage({ type: "progress", value: 5 });

      // Dynamically import Noir and bb.js
      const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
        import("@noir-lang/noir_js"),
        import("@aztec/bb.js"),
      ]);

      self.postMessage({ type: "progress", value: 15 });

      // Fetch the compiled circuit artifact
      const circuitUrl = `/circuits/${msg.circuit}_proof.json`;
      const response = await fetch(circuitUrl);
      if (!response.ok) {
        throw new Error(`Failed to load circuit: ${circuitUrl}`);
      }
      const circuitJson = await response.json();

      self.postMessage({ type: "progress", value: 30 });

      // Initialize Noir and the proving backend
      noir = new Noir(circuitJson);
      backend = new UltraHonkBackend(circuitJson.bytecode, {
        threads: navigator.hardwareConcurrency || 4,
      });

      self.postMessage({ type: "progress", value: 40 });
      self.postMessage({ type: "ready" });
    }

    if (msg.type === "prove") {
      if (!noir || !backend) {
        throw new Error("Worker not initialized. Call init first.");
      }

      self.postMessage({ type: "progress", value: 45 });

      // Generate witness
      const { witness } = await noir.execute(msg.inputs);
      self.postMessage({ type: "progress", value: 60 });

      // Generate proof
      const proof = await backend.generateProof(witness);
      self.postMessage({ type: "progress", value: 95 });

      // Return the raw proof and public inputs
      // The caller is responsible for converting to Garaga calldata format
      self.postMessage({
        type: "proof_ready",
        proof: proof.proof,
        publicInputs: proof.publicInputs,
      });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
