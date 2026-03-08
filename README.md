# Pokerstarks

[![CI](https://github.com/KaranSinghBisht/Pokerstarks/actions/workflows/ci.yml/badge.svg)](https://github.com/KaranSinghBisht/Pokerstarks/actions/workflows/ci.yml)

**Fully on-chain, zero-knowledge Texas Hold'em on Starknet. No trusted dealer. No server sees your cards.**

[Live Demo](https://frontend-seven-beta-93.vercel.app) | RE{DEFINE} Hackathon — Privacy Track | EGS Compliant

---

## Privacy Architecture

Pokerstarks implements three layers of privacy:

### Layer 1: Card Privacy (ZK Proofs)

Hole cards are encrypted with ElGamal on the Grumpkin curve. The contract **never** sees plaintext card values — decryption is client-side only. Each player shuffles and re-encrypts the deck, submitting a Noir ZK proof verified on-chain via Garaga. No single player can stack the deck. There is no trusted dealer; the entire game state lives on Starknet through Dojo ECS.

### Layer 2: Bankroll Privacy (Tongo Confidential Tokens)

Between sessions, STRK is shielded in Tongo — balances are hidden from on-chain observers.

- **Private Buy-In**: Tongo withdraw (ZK proof) -> STRK approve -> join table (one click)
- **Shield Winnings**: Leave table -> Tongo fund (one click)

Nobody can track your lifetime P&L, session results, or total holdings. Like bringing cash to a Vegas table: visible while playing, private when you leave.

### Layer 3: Session Privacy

- Spectators see **SHIELDED** instead of chip counts on privacy tables
- External observers cannot correlate poker sessions with wallet activity
- Privacy tables use STRK via Tongo; standard tables use CHIP tokens (public fallback available)

---

## How It Works

Pokerstarks implements the [mental poker](https://en.wikipedia.org/wiki/Mental_poker) protocol: players collectively shuffle and encrypt the deck using ElGamal encryption on the Grumpkin curve. Cards are revealed via partial decryption tokens, each accompanied by a zero-knowledge proof verified on-chain. The entire game state lives on Starknet through the Dojo Entity Component System.

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

## Deployed on Starknet Sepolia

The full system is deployed and indexed on Sepolia testnet.

### World

| | Address |
|---|---------|
| **Dojo World** | [`0x04c0adab2889d4c434692cad512fbf0073e355e33bc85b6c7fbbe0967c669dd7`](https://sepolia.starkscan.co/contract/0x04c0adab2889d4c434692cad512fbf0073e355e33bc85b6c7fbbe0967c669dd7) |

### System Contracts

| System | Address |
|--------|---------|
| Lobby | [`0x5a04f9ae0a0abec7c6adfc523176ba17411a477bae2a7bff29fa93992892bdf`](https://sepolia.starkscan.co/contract/0x5a04f9ae0a0abec7c6adfc523176ba17411a477bae2a7bff29fa93992892bdf) |
| Game Setup | [`0x39496df188be8cea81d3ac0258e60a8e7111dac1bbb353dec13caadd6cbab93`](https://sepolia.starkscan.co/contract/0x39496df188be8cea81d3ac0258e60a8e7111dac1bbb353dec13caadd6cbab93) |
| Shuffle | [`0x598106c1d9d41e2546f999a15f53b80ab918e28a471392047c6066f3a931b31`](https://sepolia.starkscan.co/contract/0x598106c1d9d41e2546f999a15f53b80ab918e28a471392047c6066f3a931b31) |
| Dealing | [`0x36901ad9a3a6185071f303f7f9a35f5cab5fe2b86ef9ef105fe148e423dedf1`](https://sepolia.starkscan.co/contract/0x36901ad9a3a6185071f303f7f9a35f5cab5fe2b86ef9ef105fe148e423dedf1) |
| Betting | [`0x17f3f16ab65bfee5fcd4f68b1aef0d6660ea7117430d639c442d3ee07f63d0f`](https://sepolia.starkscan.co/contract/0x17f3f16ab65bfee5fcd4f68b1aef0d6660ea7117430d639c442d3ee07f63d0f) |
| Showdown | [`0x29b1ce42171363a1928f8b131cdaeb8c5f323aa56ea8adb9bf20505ac6afcc0`](https://sepolia.starkscan.co/contract/0x29b1ce42171363a1928f8b131cdaeb8c5f323aa56ea8adb9bf20505ac6afcc0) |
| Settle | [`0x3876f692bb446bf047d821c93f8a516f0ebfef9bd3fcdae16f54ff2085d1882`](https://sepolia.starkscan.co/contract/0x3876f692bb446bf047d821c93f8a516f0ebfef9bd3fcdae16f54ff2085d1882) |
| Chat | [`0x1c3fa28dc400a60080f713778749c778ed24f683df859f369c365f2ef9c2569`](https://sepolia.starkscan.co/contract/0x1c3fa28dc400a60080f713778749c778ed24f683df859f369c365f2ef9c2569) |
| Timeout | [`0x63265f742cd6428b82026e94ba2e06d68c7ebcd97d7ec6779cab3c234ec8eb0`](https://sepolia.starkscan.co/contract/0x63265f742cd6428b82026e94ba2e06d68c7ebcd97d7ec6779cab3c234ec8eb0) |
| Arena | *Pending redeployment* |
| EGS | *Pending redeployment* |

### ZK Verifiers

| Verifier | Address |
|----------|---------|
| Shuffle Verifier | [`0x40309089f223e732973bed9b6956a2bcd4491a355d64d12f7a8824a606283f6`](https://sepolia.starkscan.co/contract/0x40309089f223e732973bed9b6956a2bcd4491a355d64d12f7a8824a606283f6) |
| Decrypt Verifier | [`0x3ff2d79aba6b812f0316d7660ee3bff353c7fb240c06e96e8fffb03e4b5233b`](https://sepolia.starkscan.co/contract/0x3ff2d79aba6b812f0316d7660ee3bff353c7fb240c06e96e8fffb03e4b5233b) |

### Infrastructure

| Service | URL |
|---------|-----|
| Torii Indexer | `https://api.cartridge.gg/x/pokerstarks-torii/torii` |
| Frontend | [https://frontend-seven-beta-93.vercel.app](https://frontend-seven-beta-93.vercel.app) |
| RPC | `https://api.cartridge.gg/x/starknet/sepolia` |

---

## Try It

### Option A: Browse the Live Site

Visit [https://frontend-seven-beta-93.vercel.app](https://frontend-seven-beta-93.vercel.app) to explore the lobby, create tables, and connect with Cartridge Controller. The live site connects to Sepolia contracts and the Torii indexer.

> **Note**: Full ZK gameplay (shuffle proofs, card dealing) requires the Garaga calldata server, which runs locally. The live site supports lobby browsing, table creation, and betting — but the cryptographic shuffle phase requires the local dev stack (see Option B).

### Option B: Full Local Demo (with ZK proofs)

```bash
# Clone and start everything
git clone https://github.com/KaranSinghBisht/Pokerstarks.git
cd Pokerstarks

# Local mode (Katana devnet)
./dev.sh

# Or Sepolia mode (uses deployed contracts)
export TORII_RPC_URL=<your-sepolia-rpc>
./dev.sh --sepolia
```

This starts Katana (or connects to Sepolia), deploys contracts, launches Torii, the Garaga calldata server, and the frontend at `localhost:3000`.

**Solo demo with bots:**
1. Open `localhost:3000` and connect with Cartridge Controller
2. Create a table
3. Click "Fill with Bots" to add AI opponents
4. Watch the ZK shuffle in action, then play a full hand

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

## EGS Compliance (Embeddable Game Standard)

Pokerstarks implements the [Embeddable Game Standard](https://docs.provable.games/embeddable-game-standard) for automatic platform compatibility.

| Requirement | Status |
|---|---|
| `IMinigameTokenData` (score, game_over, batch variants) | Implemented |
| SRC5 `supports_interface` with `IMINIGAME_ID` | Implemented |
| `IMinigameDetails` (token_name, token_description, game_details + batch) | Implemented |
| `GameDetail` struct (name/value pairs) | Implemented |
| ScoreUpdate / GameOver events | Emitted |
| Game-specific: mint, update_score, complete_session | Implemented |

The EGS system (`egs_system`) exposes `score()` and `game_over()` keyed by `felt252` token IDs, enabling any EGS platform to query game session results. SRC5 interface discovery returns `true` for `IMINIGAME_ID` (`0x1050f9a...`), allowing Denshokan and other platforms to detect and embed Pokerstarks.

---

## Agent Arena

The Arena system enables AI agent vs agent matches with Elo-rated leaderboards.

- **Register agents** with name, personality, and wallet address
- **Elo matchmaking** — K-factor 32, anti-compounding snapshot
- **Bankroll management** — deposit/withdraw chips, reserve for matches, cooldown enforcement
- **Challenge system** — 1-hour expiry, accept/decline
- **Match timeout** — anyone can cancel a stuck match after 24 hours, releasing reserved chips
- **ERC-8004 identity** — link agents to on-chain identity contracts

The arena operator creates matches, records results, and updates EGS tokens. LLM-powered agents (Claude, GPT) can play via the bot script with `--strategy llm`.

---

## Project Structure

```
contracts/                # Cairo smart contracts (Dojo ECS)
  src/
    models/               # Table, Seat, Hand, Deck, Card, Chat
    systems/              # Lobby, GameSetup, Shuffle, Dealing, Betting,
                          # Showdown, Settle, Chat, Timeout, Arena, EGS
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
  bot/                    # Headless AI poker bot (Node.js)
    index.ts              # Main state machine + CLI
    chain.ts              # Starknet.js contract interactions
    state.ts              # Torii state polling (Dojo SDK)
    prover.ts             # ZK proof generation (noir_js + bb.js)
    strategy.ts           # Betting AI (passive / aggressive / random)
    llm-strategy.ts       # LLM-powered agent (Claude/GPT personality system)
    matchmaker.ts         # Arena match orchestration with Elo
    log.ts                # Colored console output

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
| **Arena** | Agent registration, Elo matchmaking, bankroll, challenges |
| **EGS** | EGS-compliant game tokens — score, game_over, SRC5 discovery |

---

## AI Bot (Headless Player)

A headless Node.js bot that plays as a second player — useful for demos and testing. Runs the full mental poker protocol without a browser: key generation, shuffle + re-encryption with ZK proofs, partial decryption with ZK proofs, and configurable betting.

```bash
# Setup (one-time)
cd scripts/bot
npm install

# Run (after dev stack is up via ./dev.sh)
npx tsx index.ts \
  --table 1 \
  --seat 1 \
  --private-key 0x... \
  --address 0x... \
  --strategy passive
```

The bot auto-reads the world address from `contracts/manifest_dev.json`.

| Option | Default | Description |
|--------|---------|-------------|
| `--table` | (required) | Table ID to join |
| `--seat` | (required) | Seat index (0–5) |
| `--private-key` | (required) | Katana account private key |
| `--address` | (required) | Katana account address |
| `--strategy` | `passive` | `passive`, `aggressive`, `random`, `llm` (requires ANTHROPIC_API_KEY) |
| `--buy-in` | table minimum | Buy-in amount |
| `--rpc-url` | `http://localhost:5050` | Starknet RPC |
| `--torii-url` | `http://localhost:8080` | Torii indexer |
| `--world` | from manifest | World contract address |
| `--poll-ms` | `2000` | State polling interval (ms) |

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

# Required for contract migration (use your local Katana dev key)
export DOJO_PRIVATE_KEY=0x...

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
sozo migrate -P dev --private-key "$DOJO_PRIVATE_KEY"

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
export GARAGA_HOST=127.0.0.1
export GARAGA_ALLOWED_ORIGINS=http://localhost:3000
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
| `NEXT_PUBLIC_PERSIST_SESSION_SECRET` | `false` | Persist per-hand secret key in sessionStorage (disabled by default for security) |

---

## Team

Built by [Karan Singh Bisht](https://github.com/KaranSinghBisht) for the [RE{DEFINE} Hackathon](https://redefinehack.com/) — Privacy Track.

---

## License

[MIT](LICENSE)
