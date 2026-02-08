/**
 * Mental Poker protocol orchestrator.
 *
 * Manages the full cryptographic lifecycle of a poker hand:
 *   1. Key generation — each player creates an ephemeral keypair per hand
 *   2. Aggregate key — sum of all public keys
 *   3. Initial deck — 52 card points encrypted under the aggregate key
 *   4. Shuffle — each player permutes + re-encrypts the deck
 *   5. Deal — players submit reveal tokens to decrypt specific cards
 *   6. Decrypt — combine reveal tokens to recover card IDs
 */

import {
  GENERATOR,
  FIELD_P,
  generateKeypair,
  computeAggregateKey,
  elgamalEncrypt,
  computeRevealToken,
  decryptWithTokens,
  type Point,
  type EncryptedCard,
} from "./elgamal";
import { cardIdToPoint, pointToCardId } from "./encoding";
import {
  generateSecurePermutation,
  generateRandomScalars,
  applyShuffleReEncrypt,
  prepareShuffleProofInputs,
  serializeDeck,
  deserializeDeck,
} from "../noir/shuffle";
import {
  computeRevealToken as computeToken,
  prepareDecryptProofInputs,
} from "../noir/decrypt";

// ───────────────────── Session State ─────────────────────

export class MentalPokerSession {
  /** This player's ephemeral secret key for the current hand */
  readonly secretKey: bigint;
  /** This player's ephemeral public key */
  readonly publicKey: Point;

  /** Aggregate public key (set after all players submit keys) */
  private aggregateKey: Point | null = null;

  /** The current encrypted deck (updated after each shuffle) */
  private currentDeck: EncryptedCard[] = [];

  constructor() {
    const kp = generateKeypair();
    this.secretKey = kp.secretKey;
    this.publicKey = kp.publicKey;
  }

  // ───────────────────── Key Phase ─────────────────────

  /** Set the aggregate key from all players' public keys */
  setAggregateKey(publicKeys: Point[]): Point {
    this.aggregateKey = computeAggregateKey(publicKeys);
    return this.aggregateKey;
  }

  getAggregateKey(): Point | null {
    return this.aggregateKey;
  }

  // ───────────────────── Initial Deck ─────────────────────

  /**
   * Generate the initial encrypted deck.
   *
   * Each card is encrypted as:
   *   C1_i = r_i * G
   *   C2_i = (cardId + 1) * G + r_i * aggPK
   *
   * Randomness is derived deterministically from a seed so all players
   * generate the same initial deck and can verify.
   */
  generateInitialDeck(seed: bigint): EncryptedCard[] {
    if (!this.aggregateKey)
      throw new Error("Aggregate key not set");

    const deck: EncryptedCard[] = [];
    for (let i = 0; i < 52; i++) {
      const cardPoint = cardIdToPoint(i);
      // Deterministic randomness: hash(seed, i)
      // For simplicity: r_i = (seed * (i + 1)) mod (FIELD_P - 1) + 1
      const r =
        ((seed * BigInt(i + 1)) % (FIELD_P - 1n)) + 1n;
      deck.push(elgamalEncrypt(cardPoint, this.aggregateKey, r));
    }

    this.currentDeck = deck;
    return deck;
  }

  /** Serialize the initial deck for on-chain submission */
  serializeInitialDeck(): string[] {
    return serializeDeck(this.currentDeck);
  }

  // ───────────────────── Shuffle Phase ─────────────────────

  /**
   * Perform a shuffle + re-encryption on the given deck.
   * Returns the new deck and the inputs needed for proof generation.
   */
  shuffleDeck(inputDeck: EncryptedCard[]): {
    outputDeck: EncryptedCard[];
    serializedDeck: string[];
    proofInputs: Record<string, unknown>;
  } {
    if (!this.aggregateKey) throw new Error("Aggregate key not set");

    const perm = generateSecurePermutation(52);
    const randomness = generateRandomScalars(52);
    const outputDeck = applyShuffleReEncrypt(
      inputDeck,
      perm,
      randomness,
      this.aggregateKey,
    );

    const proofInputs = prepareShuffleProofInputs(
      perm,
      randomness,
      inputDeck,
      outputDeck,
      this.aggregateKey,
    );

    this.currentDeck = outputDeck;

    return {
      outputDeck,
      serializedDeck: serializeDeck(outputDeck),
      proofInputs,
    };
  }

  /** Load a deck from on-chain felt252 array */
  loadDeck(serialized: string[]): EncryptedCard[] {
    this.currentDeck = deserializeDeck(serialized);
    return this.currentDeck;
  }

  // ───────────────────── Dealing Phase ─────────────────────

  /**
   * Compute a reveal token for a specific card position in the deck.
   * Returns the token and proof inputs for the decrypt circuit.
   */
  computeRevealTokenForCard(cardPosition: number): {
    token: Point;
    proofInputs: Record<string, string>;
  } {
    if (cardPosition < 0 || cardPosition >= this.currentDeck.length) {
      throw new Error(`Invalid card position: ${cardPosition}`);
    }

    const card = this.currentDeck[cardPosition];
    const token = computeToken(this.secretKey, card.c1);
    const proofInputs = prepareDecryptProofInputs(
      this.secretKey,
      this.publicKey,
      card.c1,
      token,
    );

    return { token, proofInputs };
  }

  /**
   * Compute reveal tokens for multiple card positions at once.
   * Used during batch dealing (e.g., all hole cards or flop cards).
   */
  computeRevealTokensBatch(
    positions: number[],
  ): Array<{ position: number; token: Point; proofInputs: Record<string, string> }> {
    return positions.map((pos) => ({
      position: pos,
      ...this.computeRevealTokenForCard(pos),
    }));
  }

  // ───────────────────── Decryption ─────────────────────

  /**
   * Decrypt a card given the card position and all collected reveal tokens.
   *
   * For a hole card owned by this player:
   *   - Other players provide their reveal tokens
   *   - This player does NOT provide a token for their own cards
   *   - Compute M = C2 - sum(other_tokens) - own_token
   *     where own_token = sk * C1
   *
   * For a community card:
   *   - All players provide their reveal tokens
   *   - Compute M = C2 - sum(all_tokens)
   *
   * Returns the card ID (0-51) or -1 if decryption fails.
   */
  decryptCard(
    cardPosition: number,
    otherTokens: Point[],
    includeOwnToken: boolean = true,
  ): number {
    const card = this.currentDeck[cardPosition];

    const allTokens = [...otherTokens];
    if (includeOwnToken) {
      // Add our own reveal token
      const ownToken = computeRevealToken(this.secretKey, card.c1);
      allTokens.push(ownToken);
    }

    const decryptedPoint = decryptWithTokens(card.c2, allTokens);
    if (decryptedPoint === null) return -1;

    return pointToCardId(decryptedPoint);
  }

  // ───────────────────── Getters ─────────────────────

  getDeck(): EncryptedCard[] {
    return this.currentDeck;
  }

  getCardC1(position: number): Point {
    return this.currentDeck[position].c1;
  }
}
