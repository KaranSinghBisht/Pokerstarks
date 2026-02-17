# Pokerstarks

Fully on-chain, zero-knowledge Texas Hold'em on Starknet. No trusted dealer. No server sees your cards.

Built for the **RE{DEFINE} Hackathon — Privacy Track**.

---

## How It Works

Pokerstarks implements the [mental poker](https://en.wikipedia.org/wiki/Mental_poker) protocol: players collectively shuffle and encrypt the deck using ElGamal encryption on the Grumpkin curve. Cards are revealed via partial decryption tokens, each accompanied by a zero-knowledge proof verified on-chain. The entire game state lives on Starknet through the Dojo Entity Component System.

**No one — not the server, not the contract, not other players — can see your cards until you choose to reveal them.**

```
                          Starknet
                     +------------------+
                     |   Dojo World     |
    Players          |  +------------+  |
   +--------+        |  |   Models   |  |
   | Key    |------->|  | Table,Deck |  |
   | Setup  |  txns  |  | Hand,Seat  |  |
   +--------+        |  +------------+  |
   | Shuffle|------->|  |  Systems   |  |
   | + ZK   |  proof |  | Lobby,Bet  |  |
   | Proof  |  verify|  | Deal,Settle|  |
   +--------+        |  +-----+------+  |
   | Reveal |------->|  |  Garaga     |  |
   | + ZK   |  proof |  |  Verifiers  |  |
   | Proof  |  verify|  +-----+------+  |
   +--------+        +------------------+
       ^
       |  Noir circuits compiled to
       |  Barretenberg proofs (in-browser)
       v
   +--------+
   | bb.js  |  Client-side proving
   +--------+
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contracts | Cairo / Dojo ECS | Dojo 1.7.2, Scarb 2.12.2, Cairo 2.12.2 |
| ZK Circuits | Noir | nargo 1.0.0-beta.16 |
| Proving Backend | Barretenberg | 3.0.0-nightly.20251104 |
| On-chain Verifiers | Garaga | 1.0.1 (Python 3.10, Scarb 2.14.0) |
| Frontend | Next.js 16, React 19, TypeScript | |
| Wallet | Cartridge Controller | 0.11.3 |
| Indexer | Torii | (bundled with Dojo) |
| Local Devnet | Katana | (bundled with Dojo) |
| Styling | Tailwind CSS 4, Framer Motion | |

---

## Cryptography

**Encryption**: ElGamal on the Grumpkin curve (y² = x³ - 17, over BN254 scalar field)

| Operation | Formula |
|-----------|---------|
| Encrypt(M, PK, r) | (r·G, M + r·PK) |
| Decrypt(sk, C1, C2) | C2 - sk·C1 |
| Card Encoding | card_id = rank × 4 + suit (0–51) |

### ZK Circuits

**`shuffle_proof`** — Proves a player applied a valid permutation and correctly re-encrypted all 52 cards under the aggregate public key. Uses a seen-array approach for permutation soundness and verifies ElGamal re-encryption for each card.

**`decrypt_proof`** — Proves a player correctly computed their partial decryption token. Given public key PK, ciphertext component C1, and token T: proves there exists sk such that PK = sk·G and T = sk·C1.

Proofs are generated client-side using bb.js (Barretenberg in the browser) and verified on-chain via Garaga-generated Cairo verifier contracts using the `ultra_keccak_zk_honk` system.

---

## Game Flow

1. **Create Table** — Set blinds, buy-in range, max players (2–6), rake, public/private
2. **Key Setup** — Each player generates an ElGamal keypair; aggregate public key computed on-chain
3. **Shuffle** — Players sequentially shuffle + re-encrypt the deck, each submitting a ZK proof verified on-chain
4. **Deal** — Hole cards and community cards revealed via partial decryption tokens with ZK proofs
5. **Bet** — Standard Texas Hold'em rounds: Preflop, Flop, Turn, River (check / call / bet / raise / fold / all-in)
6. **Showdown** — Remaining players reveal hands; on-chain evaluator ranks all 21 five-card combinations from 7 cards
7. **Settle** — Pot distributed (with side pot support), rake collected, state reset

---

## Project Structure

```
contracts/                # Cairo smart contracts (Dojo ECS)
  src/
    models/               # Table, Seat, Hand, Deck, Card, Chat
    systems/              # Lobby, GameSetup, Shuffle, Dealing, Betting,
                          # Showdown, Settle, Chat, Timeout
    utils/                # HandEvaluator, CardMapping, Constants, SidePots

circuits/                 # Noir ZK circuits
  shuffle_proof/          # 52-card shuffle + re-encryption proof
  decrypt_proof/          # Partial decryption (card reveal) proof

verifiers/                # Garaga-generated on-chain verifier contracts
  shuffle_verifier/
  decrypt_verifier/

frontend/                 # Next.js web application
  src/
    app/                  # Pages — landing, lobby, table, spectator
    components/           # PokerTable, PlayerSeat, Card, BettingControls,
                          # ChatPanel, visual effects
    hooks/                # useGame, useShuffle, useReveal, useKeySetup,
                          # useLobby, useChat, useTongo, usePokerActions,
                          # useGameOrchestrator
    lib/                  # Noir proving (in-browser), Garaga calldata,
                          # ElGamal crypto, card encoding
    providers/            # StarknetProvider (Cartridge Controller)

scripts/
  garaga-server.py        # Garaga calldata generation server

dev.sh                    # One-command dev launcher
```

---

## Smart Contract Systems

| System | Responsibility |
|--------|---------------|
| **Lobby** | Create/join/leave tables, ready up, private tables with invite codes |
| **GameSetup** | Key registration, aggregate key computation, initial deck encryption |
| **Shuffle** | Sequential shuffle with on-chain ZK proof verification via Garaga |
| **Dealing** | Hole card and community card dealing via partial decryption tokens |
| **Betting** | Full betting logic — check, call, bet, raise, fold, all-in |
| **Showdown** | Hand reveal and on-chain evaluation (21 five-card combos from 7 cards) |
| **Settle** | Pot distribution with rake, proportional refunds, side pot support |
| **Chat** | On-chain messaging — text, emotes, system messages |
| **Timeout** | Deadline enforcement for player actions, auto-fold |

---

## Getting Started

### Prerequisites

- [Dojo 1.7.2](https://book.dojoengine.org/) (includes `katana`, `sozo`, `torii`)
- [Noir](https://noir-lang.org/) — nargo 1.0.0-beta.16
- [Barretenberg](https://github.com/AztecProtocol/barretenberg) — bb 3.0.0-nightly.20251104
- [Node.js](https://nodejs.org/) 20+
- [Python 3.10](https://www.python.org/) (for Garaga — strictly >=3.10, <3.11)
- [Garaga 1.0.1](https://github.com/keep-starknet-strange/garaga) (`pip install garaga==1.0.1`)

### Quick Start

```bash
# Clone
git clone https://github.com/KaranSinghBisht/Pokerstarks.git
cd Pokerstarks

# One command starts everything:
./dev.sh

# Launches:
#   1. Katana (local devnet)    → localhost:5050
#   2. Sozo (contract deploy)
#   3. Torii (indexer)          → localhost:8080
#   4. Frontend (Next.js)       → localhost:3000
```

### Manual Setup

```bash
# 1. Build and deploy contracts
cd contracts
sozo build
sozo migrate -P dev

# 2. Compile ZK circuits (one-time)
cd ../circuits/shuffle_proof && nargo compile
cd ../decrypt_proof && nargo compile

# 3. Generate verification keys (one-time)
bb prove -b circuits/shuffle_proof/target/shuffle_proof.json \
         -w circuits/shuffle_proof/target/shuffle_proof.gz \
         -o circuits/shuffle_proof/target/keccak/ \
         --oracle_hash keccak --write_vk

bb prove -b circuits/decrypt_proof/target/decrypt_proof.json \
         -w circuits/decrypt_proof/target/decrypt_proof.gz \
         -o circuits/decrypt_proof/target/keccak/ \
         --oracle_hash keccak --write_vk

# 4. Start Garaga calldata server (requires garaga venv with Python 3.10)
python scripts/garaga-server.py  # serves on :3001

# 5. Start frontend
cd frontend
cp .env.example .env.local  # then fill in contract addresses
npm install
npm run dev
```

### Environment Variables

The frontend requires a `.env.local` with the deployed contract addresses. See [`frontend/.env.example`](frontend/.env.example) for the full list. The `dev.sh` script auto-populates `NEXT_PUBLIC_WORLD_ADDRESS`.

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_WORLD_ADDRESS` | — | Dojo world contract address |
| `NEXT_PUBLIC_TORII_URL` | `http://localhost:8080` | Torii indexer endpoint |
| `NEXT_PUBLIC_TORII_RPC_URL` | `http://localhost:5050` | Katana / Starknet RPC |
| `NEXT_PUBLIC_GARAGA_API_URL` | `http://localhost:3001` | Garaga calldata server |

---

## License

TBD
