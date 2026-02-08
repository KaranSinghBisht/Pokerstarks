/**
 * Shuffle logic: permutation, re-encryption, and Noir proof input preparation.
 *
 * During the shuffle phase, each player:
 * 1. Generates a random permutation of 52 cards
 * 2. Generates 52 random scalars for re-encryption
 * 3. Applies the permutation + re-encryption to the current deck
 * 4. Prepares inputs for the Noir shuffle proof circuit
 * 5. Generates a ZK proof in a Web Worker
 * 6. Submits the new deck + proof to the contract
 */

import {
  FIELD_P,
  GENERATOR,
  elgamalReEncrypt,
  randomScalar,
  type Point,
  type EncryptedCard,
} from "../cards/elgamal";

// ───────────────────── Permutation ─────────────────────

/**
 * Fisher-Yates shuffle to generate a cryptographically random permutation.
 * Returns an array where perm[i] = source index for position i.
 *
 * Interpretation: new_deck[i] = re_encrypt(old_deck[perm[i]])
 */
export function generateSecurePermutation(n: number): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const randomBytes = new Uint8Array(4);
    crypto.getRandomValues(randomBytes);
    const j =
      ((randomBytes[0] << 24) |
        (randomBytes[1] << 16) |
        (randomBytes[2] << 8) |
        randomBytes[3]) >>>
      0;
    const idx = j % (i + 1);
    [perm[i], perm[idx]] = [perm[idx], perm[i]];
  }
  return perm;
}

/** Generate n random non-zero scalars for re-encryption. */
export function generateRandomScalars(n: number): bigint[] {
  return Array.from({ length: n }, () => randomScalar());
}

// ───────────────────── Shuffle + Re-encryption ─────────────────────

/**
 * Apply a permutation and re-encrypt each card.
 *
 * For each output position i:
 *   src = perm[i]
 *   new_C1[i] = old_C1[src] + r[i] * G
 *   new_C2[i] = old_C2[src] + r[i] * aggPubKey
 */
export function applyShuffleReEncrypt(
  deck: EncryptedCard[],
  perm: number[],
  randomness: bigint[],
  aggPubKey: Point,
): EncryptedCard[] {
  const n = deck.length;
  const newDeck: EncryptedCard[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const src = perm[i];
    newDeck[i] = elgamalReEncrypt(deck[src], aggPubKey, randomness[i]);
  }

  return newDeck;
}

// ───────────────────── Proof Input Preparation ─────────────────────

/**
 * Prepare inputs for the Noir shuffle proof circuit.
 *
 * The circuit (shuffle_proof/src/main.nr) expects:
 *   Private: perm: [u32; 52], reencrypt_randomness: [Field; 52]
 *   Public:  generator_x/y, pub_key_x/y,
 *            input_c1_x/y[52], input_c2_x/y[52],
 *            output_c1_x/y[52], output_c2_x/y[52]
 */
export function prepareShuffleProofInputs(
  perm: number[],
  randomness: bigint[],
  inputDeck: EncryptedCard[],
  outputDeck: EncryptedCard[],
  aggPubKey: Point,
): Record<string, unknown> {
  const n = perm.length;

  return {
    // Private inputs
    perm: perm.map(String),
    reencrypt_randomness: randomness.map((r) => r.toString()),

    // Public inputs
    generator_x: GENERATOR.x.toString(),
    generator_y: GENERATOR.y.toString(),
    pub_key_x: aggPubKey.x.toString(),
    pub_key_y: aggPubKey.y.toString(),

    input_c1_x: inputDeck.map((c) => c.c1.x.toString()),
    input_c1_y: inputDeck.map((c) => c.c1.y.toString()),
    input_c2_x: inputDeck.map((c) => c.c2.x.toString()),
    input_c2_y: inputDeck.map((c) => c.c2.y.toString()),

    output_c1_x: outputDeck.map((c) => c.c1.x.toString()),
    output_c1_y: outputDeck.map((c) => c.c1.y.toString()),
    output_c2_x: outputDeck.map((c) => c.c2.x.toString()),
    output_c2_y: outputDeck.map((c) => c.c2.y.toString()),
  };
}

// ───────────────────── Deck Serialization ─────────────────────

/**
 * Serialize an encrypted deck to a flat array of felt252 strings.
 * Layout: [c1_x_0, c1_y_0, c2_x_0, c2_y_0, c1_x_1, c1_y_1, ...] = 208 elements
 */
export function serializeDeck(deck: EncryptedCard[]): string[] {
  const result: string[] = [];
  for (const card of deck) {
    result.push(
      card.c1.x.toString(),
      card.c1.y.toString(),
      card.c2.x.toString(),
      card.c2.y.toString(),
    );
  }
  return result;
}

/**
 * Deserialize a flat array of felt252 strings back to an EncryptedCard array.
 * Expects 208 elements (52 cards * 4 coordinates each).
 */
export function deserializeDeck(flat: string[]): EncryptedCard[] {
  if (flat.length !== 208) {
    throw new Error(`Expected 208 elements, got ${flat.length}`);
  }
  const deck: EncryptedCard[] = [];
  for (let i = 0; i < flat.length; i += 4) {
    deck.push({
      c1: { x: BigInt(flat[i]), y: BigInt(flat[i + 1]) },
      c2: { x: BigInt(flat[i + 2]), y: BigInt(flat[i + 3]) },
    });
  }
  return deck;
}
