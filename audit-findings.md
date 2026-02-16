# Pokerstarks Audit Findings (Static Review)

Date: 2026-02-09

This document summarizes issues found via a static code review of the Pokerstarks repository. It is not a formal security audit and does not include formal verification, fuzzing, economic analysis, or adversarial testing.

## Scope

- Cairo/Dojo contracts: `contracts/src/systems/*.cairo`, `contracts/src/models/*.cairo`, `contracts/src/utils/*.cairo`
- Noir circuits: `circuits/shuffle_proof/src/main.nr`, `circuits/decrypt_proof/src/main.nr`
- Frontend cryptography and proof-input plumbing: `frontend/src/lib/cards/*`, `frontend/src/lib/noir/*`

## System Summary (As Implemented)

- Dojo ECS models store table/hand state, encrypted decks, reveal tokens, and community cards.
- Protocol intent resembles a mental-poker flow:
  - Players submit per-hand public keys, agree on an aggregate public key.
  - An encrypted deck is created and then shuffled by each player with a ZK proof.
  - Players submit partial decryption ("reveal") tokens with a ZK proof.
  - Cards are decrypted off-chain and then revealed on-chain for showdown.

## Key Findings (Prioritized)

| ID | Severity | Category | Title |
|---:|:--------:|----------|-------|
| F-01 | Critical | ZK / Integrity | Shuffle proofs are not bound to the on-chain deck state |
| F-02 | Critical | ZK / Integrity | Reveal-token proofs are not bound to the on-chain deck card position |
| F-03 | Critical | Game Integrity | Showdown accepts plaintext card IDs with no cryptographic linkage |
| F-04 | High | Funds / Accounting | ERC20 `transfer()` return values are ignored |
| F-05 | High* | Protocol Design | Initial deck encryption randomness is deterministic/public in frontend |
| F-06 | Medium | ZK / Soundness | Shuffle permutation constraint is non-standard (sum/product in a field) |
| F-07 | Medium | Correctness | Card decoding uses x-coordinate only (P vs -P ambiguity) |

\* F-05 severity depends on the intended threat model (see "Threat Model Notes").

## Detailed Findings

### F-01: Shuffle proofs are not bound to the on-chain deck state

Severity: Critical

Where
- `contracts/src/systems/shuffle.cairo`

What happens
- The contract verifies a Garaga proof and stores the `new_deck` argument on-chain.
- It does not compare the proof's public-input deck to the previously stored on-chain deck, and it does not compare the proof's public-output deck to the submitted `new_deck`.

Evidence
- `contracts/src/systems/shuffle.cairo` verifies `verify_ultra_keccak_zk_honk_proof(proof.span())` then writes `EncryptedDeck { ... cards: new_deck }`.
- Only proof public input checked is aggregate pubkey coordinates (if `public_inputs.len() >= 4`).

Impact
- A caller can submit a valid proof about some decks but store an unrelated deck on-chain ("valid proof, wrong deck").
- The deck chain-of-custody across shuffle rounds is not enforced.

Recommendation (minimal)
1. Read the expected input deck from storage for the current hand/version.
2. Compare proof public inputs for `input_*` to that stored deck.
3. Compare proof public outputs for `output_*` to the submitted `new_deck`.
4. Consider domain separation: ensure proof binds to `(hand_id, shuffle_round)` (e.g., by including them as public inputs or hashing them into the verified statement).

---

### F-02: Reveal-token proofs are not bound to the on-chain deck card position

Severity: Critical

Where
- `contracts/src/systems/dealing.cairo`
- Noir circuit: `circuits/decrypt_proof/src/main.nr`

What happens
- The decrypt proof circuit proves discrete-log equality: there exists `sk` such that `PK = sk*G` and `T = sk*C1`.
- The contract checks `PK` matches submitter's stored pubkey and checks `T` matches submitted `(token_x, token_y)`.
- The contract does not verify that the proof's `C1` corresponds to the on-chain encrypted deck's C1 at `card_position`.
- The contract does not read `EncryptedDeck` at all during token submission.

Evidence
- `circuits/decrypt_proof/src/main.nr` includes `c1_x/c1_y` as public inputs.
- `contracts/src/systems/dealing.cairo` checks public inputs indices 2/3 (pubkey) and 6/7 (token), but does not check `c1_*`.

Impact
- Tokens can be valid for arbitrary C1 values, not for the actual card ciphertext being revealed.
- Phase completion can be satisfied with meaningless tokens, causing the game to advance without cryptographic correctness.

Recommendation (minimal)
1. Load the current deck (final shuffled version) on-chain and extract C1 at `card_position`.
2. Assert the proof's public `c1_x/c1_y` match the deck's C1 coordinates for that position.
3. Ensure token requirements and completion checks are computed against the correct deck version.

---

### F-03: Showdown accepts plaintext card IDs with no cryptographic linkage

Severity: Critical

Where
- `contracts/src/systems/showdown.cairo`

What happens
- `reveal_hand(...)` accepts two u8 card IDs directly.
- `set_community_cards(...)` accepts five u8 card IDs directly (callable by any seated player).
- The contract enforces uniqueness/range constraints, but does not prove that these IDs are the decryption of the on-chain encrypted deck under collected reveal tokens.

Evidence
- `contracts/src/systems/showdown.cairo` stores provided IDs after checking they don't conflict with already-claimed cards.

Impact
- A malicious player can claim any hole cards that don't violate uniqueness constraints.
- A seated caller can set arbitrary community cards (subject to uniqueness), changing outcomes.
- Net effect: gameplay is not trustless; correctness depends on honest clients/social consensus.

Recommendation (design-level)
- If the goal is trustless poker, the chain must verify that revealed cards correspond to the encrypted deck and tokens. Common options:
  1. Add a ZK proof that a card ID is the correct decryption of `(ciphertext, token set)`.
  2. Commit to decrypted card points/ids earlier with a verifiable commitment scheme.
  3. Make the threat model explicit: if reveals are intentionally off-chain/honesty-based, document that as a non-security property.

Resolution (mitigated)
- Replaced direct card ID submission with a consensus-based `submit_card_decryption` system. All active players must independently compute and submit the decrypted card ID for each position. When all votes are collected, majority vote determines the accepted value (strict majority required — >50%). Reveal tokens with ZK proofs (F-02 fix) must exist for the position before voting is allowed. If no majority exists (e.g., 2-player disagreement), the card stays unresolved and the Showdown timeout handler aborts the hand. A single griefer submitting a wrong value is outvoted by honest players in 3+ player games.

---

### F-04: ERC20 `transfer()` return values are ignored

Severity: High

Where
- `contracts/src/systems/lobby.cairo` (withdraw on `leave_table`)
- `contracts/src/systems/showdown.cairo` (rake transfer)
- `contracts/src/systems/settle.cairo` (rake transfer)

What happens
- The code calls `token.transfer(...)` but does not assert the returned boolean.
- `transfer_from(...)` during buy-in is checked (`assert(success, 'token transfer failed')`).

Impact
- If the token returns `false` (or otherwise fails without reverting), the contract proceeds as if payment succeeded.
- Can break accounting assumptions and create stuck/unpaid payouts.

Recommendation (minimal)
- Capture and `assert(success, 'token transfer failed')` consistently for all `transfer()` calls.

---

### F-05: Initial deck encryption randomness is deterministic/public in frontend

Severity: High (threat-model dependent)

Where
- `frontend/src/lib/cards/mental-poker.ts`
- `frontend/src/lib/cards/elgamal.ts` (ElGamal structure)

What happens
- Initial deck encryption randomness `r_i` is derived deterministically from a public seed: `r_i = ((seed*(i+1)) mod (p-1)) + 1`.
- In standard ElGamal over EC points, if `r` is known, anyone can compute `M = C2 - r*PK` without any secret key.

Impact
- If the initial encrypted deck is posted on-chain before at least one shuffle introduces fresh secret randomness, card secrecy is lost.
- If the protocol relies on "at least one honest shuffler" to restore secrecy, that must be explicit (and the pre-shuffle deck should not be treated as confidential).

Recommendation
- Avoid publishing an ElGamal encryption whose randomness is publicly computable.
- If you need deterministic consensus, use commitments to randomness + later reveal, or require immediate first shuffle before exposing ciphertexts, or incorporate per-player secret contributions.

Resolution (accepted risk)
- This is the standard mental poker security model: deck secrecy relies on **at least one honest shuffler** introducing fresh secret randomness via re-encryption. Each player shuffles with a ZK proof and non-zero randomness (enforced by the circuit: `assert(r != 0)`). The initial deck with public randomness is never treated as confidential — it exists only as a deterministic starting point for the shuffle chain. The assumption is documented in `circuits/shuffle_proof/src/main.nr`.

---

### F-06: Shuffle permutation constraint is non-standard

Severity: Medium

Where
- `circuits/shuffle_proof/src/main.nr`

What happens
- Permutation validity is checked using:
  - Sum of elements equals `N*(N-1)/2`.
  - Product of `(perm[i] + 1)` equals factorial product (over a finite field).

Impact
- Sum/product constraints are not the typical sound way to enforce all-distinctness in ZK circuits.
- Depending on the field and constraint system, distinct multisets can collide in product/sum checks.

Recommendation
- Use a standard permutation argument (e.g., sorting + adjacency checks, or a dedicated permutation/range-check gadget).
- If keeping current approach, document why it is considered sound for N=52 and the chosen field (and validate with adversarial tests).

Resolution (A-02 fix)
- Replaced sum+product check with a `seen` boolean array: each index is range-checked (`perm[i] < N`) and uniqueness is enforced via `assert(!seen[perm[i]])`. This is provably sound for all N. See `circuits/shuffle_proof/src/main.nr` lines 59-68.

---

### F-07: Card decoding uses x-coordinate only

Severity: Medium

Where
- `frontend/src/lib/cards/encoding.ts`

What happens
- Reverse lookup maps decrypted point to card ID via `point.x` only.

Impact
- On short Weierstrass curves, `P` and `-P` share the same x-coordinate.
- Using x-only introduces ambiguity and can mask incorrect decryptions or malformed points.

Recommendation
- Use both coordinates (x,y) for reverse lookup, or enforce a canonical sign convention during encoding/decoding.

Resolution (fixed)
- Reverse lookup now uses both coordinates: key is `${point.x},${point.y}`. See `encoding.ts` lines 28-35.

## Threat Model Notes

The current on-chain implementation does not cryptographically enforce that revealed cards correspond to the encrypted deck and collected reveal tokens. If the intended product is "trustless poker", F-01 through F-03 are blockers.

If the intended product is "client-enforced correctness" (i.e., the chain is just a coordination layer), then these become "assumption risks" that must be documented and defended (e.g., via reputation, fraud proofs, dispute mechanisms, or social consensus). As written, no on-chain dispute mechanism is present.

## Positive Observations (Non-Exhaustive)

- Turn-based betting enforces caller turn in `contracts/src/systems/betting.cairo`.
- Timeout enforcement is comprehensive in `contracts/src/systems/timeout.cairo` and attempts to keep the game progressing.
- `compute_winner` checks that community cards are set and all non-folded players revealed in `contracts/src/systems/showdown.cairo`.

## Appendix: Reviewed Files (Core)

- Contracts/systems:
  - `contracts/src/systems/lobby.cairo`
  - `contracts/src/systems/game_setup.cairo`
  - `contracts/src/systems/shuffle.cairo`
  - `contracts/src/systems/dealing.cairo`
  - `contracts/src/systems/betting.cairo`
  - `contracts/src/systems/showdown.cairo`
  - `contracts/src/systems/settle.cairo`
  - `contracts/src/systems/timeout.cairo`
- Circuits:
  - `circuits/shuffle_proof/src/main.nr`
  - `circuits/decrypt_proof/src/main.nr`
- Frontend crypto/plumbing:
  - `frontend/src/lib/cards/mental-poker.ts`
  - `frontend/src/lib/cards/elgamal.ts`
  - `frontend/src/lib/cards/encoding.ts`
  - `frontend/src/lib/noir/shuffle.ts`
  - `frontend/src/lib/noir/decrypt.ts`
