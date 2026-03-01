# SECURITY.md — STARK POKER Security Model

This document describes the security properties, known limitations, and design tradeoffs of the STARK POKER protocol. It was written in response to an internal security audit and is intended for judges, reviewers, and future contributors.

---

## 1. Field Representation (A-01)

**Grumpkin curve coordinates are stored as `felt252` in Cairo contracts.**

The Grumpkin curve is defined over the BN254 scalar field, whose prime `r` (~2.19e76) is approximately 6x larger than the Starknet `felt252` modulus `p` (~3.62e75). This means that *in theory*, a BN254 scalar field element could exceed what `felt252` can represent.

**Why this is safe in practice:**

- All Grumpkin points used in this protocol (generator point, encrypted card coordinates, reveal tokens) have coordinate values well within the `felt252` range.
- The `u256 → felt252` conversion uses `try_into().unwrap()`, which **reverts the transaction** if a value exceeds the `felt252` modulus. There is no silent truncation — an invalid coordinate would cause an on-chain panic, not data corruption.
- This is a safe guard, not a vulnerability. The protocol never produces coordinates outside `felt252` range under normal operation.

**Roadmap:** A future version could add explicit range checks with descriptive error messages rather than relying on `unwrap()` panics.

---

## 2. Showdown Model (A-02)

**The current showdown uses vote-based consensus rather than on-chain cryptographic card reconstruction.**

### How it works

At showdown, each remaining player submits their claimed hole card IDs. The contract accepts the claim if >50% of active players agree on the same card values. This is a majority-vote consensus mechanism.

### Why this design was chosen

On-chain cryptographic reconstruction would require EC point arithmetic (scalar multiplication and point addition) in Cairo to combine all reveal tokens and decrypt the card. This is:
- Computationally expensive (high gas cost per EC operation)
- Complex to implement correctly within Dojo's ECS model

For the hackathon, the vote-based approach provides a functional showdown with acceptable security for small player counts.

### Collusion threshold

An attacker would need to control >N/2 of the active players at showdown to submit false card claims. In a 2-player game this means controlling both players (pointless). In a 6-player game with 4 remaining, it requires 3 colluding players.

### Roadmap

The contract code contains a `P0 FIX` comment marking this for replacement with cryptographic reconstruction. The fix involves:
1. Storing all reveal tokens on-chain (already done)
2. Implementing EC point addition in Cairo to combine tokens
3. Mapping the decrypted point back to a card ID using a precomputed lookup
4. Removing the vote mechanism entirely

---

## 3. Verifier Trust Model (A-03)

**Verifier contract addresses are set at table creation time.**

### The risk

The `create_table()` function accepts arbitrary `shuffle_verifier` and `decrypt_verifier` addresses. A malicious table creator could deploy a fake verifier that always returns `Ok`, effectively bypassing ZK proof validation for shuffle and decrypt operations.

### Current mitigations

- **Frontend validation:** The frontend parses verifier addresses from Torii and compares them against canonical (known-good) addresses. Tables with non-canonical verifiers display a prominent "UNVERIFIED TABLE" warning banner on the game page and an "UNVERIFIED" badge in the lobby.
- **Canonical addresses (Sepolia):**
  - Shuffle verifier: `0x40309089f223e732973bed9b6956a2bcd4491a355d64d12f7a8824a606283f6`
  - Decrypt verifier: `0x3ff2d79aba6b812f0316d7660ee3bff353c7fb240c06e96e8fffb03e4b5233b`

### Limitations

This is a frontend-only check. Users interacting directly with the contract (or using a different frontend) would not see warnings. The contract itself does not enforce an allowlist.

### Roadmap

A contract upgrade should add an on-chain verifier allowlist managed by a governance address, so that `create_table()` rejects non-allowlisted verifier addresses at the contract level.

---

## 4. Invite Codes in Plaintext Calldata (A-05)

**Private table invite codes are visible in transaction calldata.**

The contract's `join_table()` function accepts a plaintext invite code and hashes it on-chain using Poseidon. Since Starknet transactions are public, the invite code can be read from calldata by anyone monitoring the network.

### Why this can't be fixed without redeployment

Changing to a commitment scheme (where the user submits a pre-hashed value) would require the contract to expect a hash instead of plaintext. The current contract would double-hash a pre-hashed input, causing verification to always fail.

### Practical impact

Low for the hackathon use case. Private tables are a convenience feature (preventing casual lobby-browsing players from joining), not a security boundary. A determined observer monitoring Starknet mempool or transaction history could extract invite codes, but this requires active effort.

### Roadmap

A future contract version should use a commitment scheme: the table creator commits `H(invite_code)` at creation, and joiners submit `H(invite_code)` which is compared directly. Alternatively, use a signature-based invitation system where the creator signs seat assignments.

---

## 5. Bot API Authentication (A-04)

**The bot API is protected by a bearer token (`BOT_API_SECRET`).**

In production (`NODE_ENV=production`), if `BOT_API_SECRET` is not set, all bot API requests are **rejected**. This prevents accidental open access if the environment variable is forgotten during deployment.

In development mode, the bot API is open to allow local testing without configuration.

---

## 6. Bot Account Keys (A-06)

**`bot-accounts.json` has never been committed to version control.**

This file contains private keys for bot accounts used in development/testing. It is listed in `.gitignore` (line 57) and `git log --all -- bot-accounts.json` confirms it was never part of any commit. This finding was a false positive.
