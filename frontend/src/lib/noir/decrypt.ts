/**
 * Decrypt (reveal token) proof logic.
 *
 * During dealing, each player must provide reveal tokens for the cards
 * they need to help decrypt. A reveal token proves:
 *   Given public_key PK and ciphertext component C1,
 *   the player knows secret_key sk such that:
 *     PK = sk * G
 *     T  = sk * C1
 *
 * This is a discrete-log equality proof (Chaum-Pedersen style).
 */

import {
  GENERATOR,
  computeRevealToken as ecComputeRevealToken,
  type Point,
} from "../cards/elgamal";

// ───────────────────── Token Computation ─────────────────────

/**
 * Compute a reveal token for a specific card position.
 * T = sk * C1 where C1 is the first component of the encrypted card.
 */
export function computeRevealToken(secretKey: bigint, c1: Point): Point {
  return ecComputeRevealToken(secretKey, c1);
}

// ───────────────────── Proof Input Preparation ─────────────────────

/**
 * Prepare inputs for the Noir decrypt proof circuit.
 *
 * The circuit (decrypt_proof/src/main.nr) expects:
 *   Private: secret_key: Field
 *   Public:  generator_x/y, pub_key_x/y, c1_x/y, token_x/y
 */
export function prepareDecryptProofInputs(
  secretKey: bigint,
  publicKey: Point,
  c1: Point,
  token: Point,
): Record<string, string> {
  return {
    // Private input
    secret_key: secretKey.toString(),

    // Public inputs
    generator_x: GENERATOR.x.toString(),
    generator_y: GENERATOR.y.toString(),
    pub_key_x: publicKey.x.toString(),
    pub_key_y: publicKey.y.toString(),
    c1_x: c1.x.toString(),
    c1_y: c1.y.toString(),
    token_x: token.x.toString(),
    token_y: token.y.toString(),
  };
}
