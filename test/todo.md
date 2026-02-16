# STARK POKER — Testing & Manual Tasks Checklist

> Project completeness: Contracts 100% | Circuits 100% | Verifiers 100% | Frontend 75% | Deployment 30%
> Two audit rounds remediated (F-01..F-07, A-01..A-10). Both `sozo build` and `npm run build` pass.

---

## 1. Local Environment Setup

You need **4 terminals** running simultaneously:

```bash
# Terminal 1: Local devnet
katana --dev --dev.no-fee

# Terminal 2: Deploy contracts
cd contracts
sozo migrate apply
# NOTE: Copy the world address from the output!

# Terminal 3: Indexer
torii --world <WORLD_ADDRESS_FROM_STEP_2> --allowed-origins "*"

# Terminal 4: Frontend
cd frontend
cp .env.example .env.local
# Edit .env.local — fill in world address + contract addresses from sozo output
npm run dev
```

**Optional — Garaga calldata server** (needed for proof→calldata conversion):
```bash
python3.10 -m venv garaga-venv && source garaga-venv/bin/activate
pip install garaga==1.0.1 flask
python scripts/garaga-server.py
```

**Testing setup**: Open 2 browser windows (one regular, one incognito) to simulate 2 players.

---

## 2. Contract Tests

### Lobby (`lobby.cairo`)
- [ ] Create table with valid params (2 players, 10/20 blinds, 1000/2000 buy-in) → table_id returned
- [ ] Create table with invalid params (0 blinds) → reverts
- [ ] Create table with >6 max_players → reverts
- [ ] Join table → seat assigned, chips deducted
- [ ] Join full table → reverts
- [ ] Join with buy-in below min → reverts
- [ ] Join with buy-in above max → reverts
- [ ] Leave table between hands → seat freed, chips refunded
- [ ] Set ready → player marked ready
- [ ] Both players set ready → hand auto-starts (phase → Setup)

### Game Setup (`game_setup.cairo`)
- [ ] Submit public key → stored in PlayerHand
- [ ] Submit duplicate key → reverts `'key already submitted'`
- [ ] Submit with x=0 key → rejected (sentinel value, A-09 documented)
- [ ] All keys submitted → phase transitions to aggregate key consensus
- [ ] Submit aggregate key → consensus tracking increments
- [ ] All aggregate keys match → agg key stored on Hand
- [ ] Submit initial deck hash → consensus tracking increments
- [ ] All deck hashes match → phase transitions to Shuffling

### Shuffle (`shuffle.cairo`)
- [ ] Submit valid shuffle + proof → deck updated, shuffle_progress incremented
- [ ] Submit with wrong generator in proof → reverts `'proof: wrong generator x'` (A-03 fix)
- [ ] Submit out of turn → reverts
- [ ] All players shuffle → phase transitions to DealingPreflop
- [ ] Verify EncryptedDeck versions are contiguous (0, 1, ..., num_players)

### Dealing (`dealing.cairo`)
- [ ] Submit reveal token with valid decrypt proof → token stored, proof_verified=true
- [ ] Submit invalid proof → reverts
- [ ] **Folded player submits token → ALLOWED** (A-05 fix — n-of-n needs all players)
- [ ] All tokens for a hole card position collected → card decryptable client-side
- [ ] All tokens for flop positions collected → community cards available
- [ ] Phase transitions correctly: DealingPreflop → BettingPreflop, DealingFlop → BettingFlop, etc.

### Betting (`betting.cairo`)
- [ ] Fold → has_folded=true, active_players decremented
- [ ] Check when no bet → valid
- [ ] Check when bet exists → reverts `'cannot check'`
- [ ] Call → chips transferred, pot increased by call amount
- [ ] Bet (no prior bet) → min is big_blind
- [ ] Bet below big_blind → reverts `'bet below minimum'`
- [ ] Raise → min is current_bet + big_blind
- [ ] Raise below min → reverts `'raise below minimum'`
- [ ] All-in → chips zeroed, is_all_in=true
- [ ] All-in that exceeds current bet → resets has_acted for others
- [ ] Insufficient chips for action → reverts `'not enough chips'`
- [ ] Action when not your turn → reverts `'not your turn'`
- [ ] Round complete (all acted, bets equal) → phase advances
- [ ] Only 1 active player remains → Settling (last player wins)

### Side Pots (A-07 fix)
- [ ] **Setup**: 3 players — P1 has 500 chips, P2 has 1000, P3 has 1000
- [ ] P1 goes all-in (500), P2 calls (500), P3 raises to 1000, P2 calls
- [ ] Verify SidePot(index=0): amount=1500 (500 × 3), eligible_mask includes P1+P2+P3
- [ ] Verify SidePot(index=1): amount=1000 (500 × 2), eligible_mask includes P2+P3 only
- [ ] Showdown: If P1 has best hand → P1 wins pot 0, P2/P3 contest pot 1
- [ ] Showdown: If P2 has best hand → P2 wins both pots
- [ ] No side pots when nobody is all-in → single pot distribution (backward compat)

### Showdown (`showdown.cairo`)
- [ ] Submit card decryption vote → CardDecryptionVote stored
- [ ] Submit duplicate vote → reverts `'already voted'`
- [ ] All active players vote same card_id → consensus reached, card stored
- [ ] Votes disagree → reverts `'card decryption disagreement'`
- [ ] compute_winner with missing community card → reverts (A-06: checks all 5)
- [ ] compute_winner with missing hole card → reverts `'not all players revealed'`
- [ ] compute_winner with duplicate card IDs → reverts `'duplicate community card'` / `'hole dupes community'`
- [ ] compute_winner with card_id >= 52 → reverts `'invalid flop_1 id'` etc.
- [ ] Winner determined correctly by hand rank
- [ ] Tied hands → pot split equally (remainder to first winner found)
- [ ] Rake deducted before distribution (if table.rake_bps > 0)

### Timeout (`timeout.cairo`)
- [ ] Call enforce_timeout before deadline → reverts `'not timed out yet'`
- [ ] **Shuffle timeout** → identity deck written at next version, player skipped (A-04 fix)
- [ ] **Dealing timeout** → hand aborted to Settling (A-05 fix — can't decrypt without all tokens)
- [ ] **Betting timeout** → timed-out player auto-folded
- [ ] **Showdown timeout** → timed-out player loses (auto-muck)

### Settle (`settle.cairo`)
- [ ] distribute_pot → chips added to winner's seat
- [ ] Rake transferred to rake_recipient (if ERC20 configured)
- [ ] start_next_hand → dealer_seat rotated, hand_id incremented

### Chat (`chat.cairo`)
- [ ] Send text message → ChatMessage stored with content
- [ ] Send emote → ChatMessage stored with emote ID
- [ ] Message truncation at max length → works

### Hand Evaluator (`hand_evaluator.cairo`)
- [ ] Royal flush beats straight flush
- [ ] Straight flush beats four of a kind
- [ ] Four of a kind beats full house
- [ ] Full house beats flush
- [ ] Flush beats straight
- [ ] Straight beats three of a kind
- [ ] Three of a kind beats two pair
- [ ] Two pair beats one pair
- [ ] One pair beats high card
- [ ] Wheel straight (A-2-3-4-5) recognized as straight
- [ ] Broadway straight (10-J-Q-K-A) recognized
- [ ] Ace-high flush beats king-high flush
- [ ] Split pot: identical hands → equal distribution
- [ ] Kicker comparison: pair of Aces + K kicker > pair of Aces + Q kicker

---

## 3. Frontend Tests

### Pages
- [ ] `/` (Lobby) loads, shows table list or "no tables" message
- [ ] Create table form validates inputs (player count 2-6, blinds > 0)
- [ ] Join table navigates to `/table/[id]`
- [ ] `/table/[id]` renders poker table with 6 seat positions
- [ ] `/spectate/[id]` renders same table, read-only (no betting controls)
- [ ] Spectator never sees hole cards (always face-down)

### Wallet Connection
- [ ] "Connect Wallet" button visible when disconnected
- [ ] Clicking connect → Cartridge Controller popup appears
- [ ] After connect → username displays in header
- [ ] Disconnect → returns to disconnected state
- [ ] Session persists on page refresh

### Game Flow (Visual Verification)
- [ ] **Setup phase**: "Generating keys..." indicator appears, auto-submits
- [ ] **Shuffle phase**: Progress bar per player (Player 1: Complete, Player 2: Generating proof...)
- [ ] **Shuffle**: Proof generation progress percentage visible (0% → 100%)
- [ ] **Dealing Preflop**: Hole cards appear face-down, then reveal your own cards
- [ ] **Dealing Flop**: 3 community cards appear in center
- [ ] **Dealing Turn**: 4th community card appears
- [ ] **Dealing River**: 5th community card appears
- [ ] **Betting**: Controls appear ONLY on your turn
- [ ] **Betting**: Fold/Check/Call buttons highlight correctly
- [ ] **Betting**: Bet/Raise slider or input validates min/max
- [ ] **Betting**: Pot amount in center updates after each action
- [ ] **Betting**: Player bet amounts show next to their seat
- [ ] **Showdown**: All remaining players' cards flip to face-up
- [ ] **Showdown**: Winner highlighted, pot slides to winner
- [ ] **Status badges**: FOLDED (gray), ALL IN (red), READY (green) display correctly

### Hooks (Automated Behavior)
- [ ] `useGame` — Torii subscription fires on model changes (check browser console)
- [ ] `useLobby` — Table list refreshes when new table created
- [ ] `useKeySetup` — Public key auto-submitted on Setup phase (no user action needed)
- [ ] `useKeySetup` — Aggregate key auto-computed and submitted
- [ ] `useKeySetup` — Initial deck hash auto-submitted
- [ ] `useShuffle` — Shuffle + proof auto-generated when it's your turn
- [ ] `useShuffle` — Progress percentage updates in real-time
- [ ] `useReveal` — Reveal tokens auto-submitted for dealing phases
- [ ] `useReveal` — Hole cards decrypt and display after all tokens collected
- [ ] `useReveal` — Showdown decryption votes auto-submitted
- [ ] `useChat` — **KNOWN BROKEN**: sendMessage/sendEmote are stubs (no contract calls)
- [ ] `usePokerActions` — All betting actions execute real transactions

### Error Handling
- [ ] Torii not running → frontend falls back to mock data (tables still render)
- [ ] Proof generation fails → error message shown to user
- [ ] Transaction reverts → error toast/message displayed
- [ ] Garaga server down → proof conversion fails, error shown

---

## 4. Circuit Tests

### Shuffle Proof (`circuits/shuffle_proof/`)
```bash
cd circuits/shuffle_proof
nargo compile                    # Should succeed
nargo prove                      # Generates proof from Prover.toml vectors
```
- [ ] Compiles without errors
- [ ] Proves successfully with valid test vectors
- [ ] **A-02 fix verification**: Modify Prover.toml to have duplicate perm index → proof FAILS
- [ ] Proof size is reasonable (< 100KB)

### Decrypt Proof (`circuits/decrypt_proof/`)
```bash
cd circuits/decrypt_proof
nargo compile
nargo prove
```
- [ ] Compiles without errors
- [ ] Proves successfully
- [ ] Proof generation time < 3 seconds

### Verifier Regeneration (after any circuit changes)
```bash
# Shuffle verifier
cd circuits/shuffle_proof
bb write_vk -b target/shuffle_proof.json -o target/vk
bb write_vk -b target/shuffle_proof.json -o target/keccak/vk --honk_recursion 1
garaga gen --system ultra_keccak_honk --vk target/keccak/vk \
    --project-name ../../verifiers/shuffle_verifier

# Decrypt verifier
cd ../decrypt_proof
bb write_vk -b target/decrypt_proof.json -o target/vk
bb write_vk -b target/decrypt_proof.json -o target/keccak/vk --honk_recursion 1
garaga gen --system ultra_keccak_honk --vk target/keccak/vk \
    --project-name ../../verifiers/decrypt_verifier

# Build verifiers
cd ../../verifiers/shuffle_verifier && scarb build
cd ../decrypt_verifier && scarb build

# Update frontend circuit artifacts
cp circuits/shuffle_proof/target/shuffle_proof.json frontend/public/circuits/
cp circuits/decrypt_proof/target/decrypt_proof.json frontend/public/circuits/
```
- [ ] All commands succeed
- [ ] Verifier contracts compile
- [ ] Frontend circuit JSON files updated

---

## 5. Full End-to-End Integration Test

> The holy grail. 2 browser windows (one incognito), full Texas Hold'em hand.

### Prerequisites
- [ ] Katana running
- [ ] Contracts deployed (`sozo migrate apply`)
- [ ] Torii running and indexing
- [ ] Garaga server running
- [ ] Frontend running (`npm run dev`)
- [ ] `.env.local` configured with all addresses

### The Hand

| Step | Player 1 | Player 2 | Expected |
|------|----------|----------|----------|
| 1 | Connect wallet | Connect wallet | Both see lobby |
| 2 | Create table (2p, 10/20, 1000-2000) | — | Table appears in list |
| 3 | — | Join table (1000 buy-in) | Both at table, seats assigned |
| 4 | Click "Ready" | Click "Ready" | Hand starts → Setup phase |
| 5 | (auto) | (auto) | Public keys submitted |
| 6 | (auto) | (auto) | Aggregate keys + deck hash consensus |
| 7 | (auto) | (auto) | Initial deck created |
| 8 | (auto — ~12s) | (waiting) | P1 shuffles + proof submitted |
| 9 | (waiting) | (auto — ~12s) | P2 shuffles + proof submitted |
| 10 | (auto) | (auto) | Reveal tokens for hole cards submitted |
| 11 | Sees own 2 cards | Sees own 2 cards | Each player sees ONLY their own cards |
| 12 | (auto: small blind posted) | (auto: big blind posted) | Blinds deducted |
| 13 | Bet 40 | — | Pot: 70 (10+20+40) |
| 14 | — | Call 40 | Pot: 110 |
| 15 | (auto) | (auto) | Reveal tokens for flop |
| 16 | Sees 3 community cards | Sees same 3 cards | Flop dealt |
| 17 | Check | Check | Betting round complete |
| 18 | (auto) | (auto) | Turn dealt |
| 19 | Bet 50 | Call | Pot: 210 |
| 20 | (auto) | (auto) | River dealt |
| 21 | Check | Check | Go to showdown |
| 22 | (auto) | (auto) | Decryption votes submitted |
| 23 | See all cards | See all cards | Winner announced |
| 24 | Chips updated | Chips updated | Pot distributed correctly |

- [ ] All 24 steps complete without errors
- [ ] Game state matches at every phase transition
- [ ] No console errors (check browser DevTools)
- [ ] Torii shows correct model state at each step

---

## 6. Manual Tasks (Human Work Required)

### GRAPHICS & ASSETS

#### Card Faces (52 SVGs) — `frontend/public/cards/`
- [ ] **Find or create a card deck SVG set**
  - Option A: [deck.of.cards](https://deck.of.cards) — free SVG set
  - Option B: [OpenGameArt poker cards](https://opengameart.org) — CC-licensed
  - Option C: Generate with CSS (current fallback — text rank + colored suit symbol)
  - Option D: Commission/design custom cards with STARK POKER branding
- [ ] Name files as: `2_hearts.svg`, `ace_spades.svg`, `king_diamonds.svg`, etc.
- [ ] Ensure consistent sizing (roughly 70×100 viewbox)
- [ ] Update `Card.tsx` component to use SVGs instead of text rendering

#### Card Back — `frontend/public/cards/back.svg`
- [ ] Design or find a card back SVG
- [ ] Current: blue CSS gradient with poker chip emoji — functional but plain
- [ ] Ideal: custom design with STARK POKER logo or ZK-themed pattern

#### Emotes — `frontend/public/emotes/`
- [ ] Currently text-only (GG, Nice Hand, Bluff!, etc.)
- [ ] **Optional**: Create small emote icons (32×32 PNG/SVG)
- [ ] If skipping: text emotes work fine for hackathon demo

#### Branding
- [ ] **Favicon** — replace default Next.js favicon with poker chip/card icon
- [ ] **Logo** — STARK POKER text logo or icon for header bar
- [ ] **OG Image** — 1200×630 social preview for link sharing (OpenGraph)
- [ ] **Color scheme** — currently dark poker green, may want to refine

### SOUND EFFECTS — `frontend/public/sounds/`
- [ ] Card deal / slide sound (`.mp3` or `.ogg`)
- [ ] Chip clink for bets/calls
- [ ] Fold sound (soft thud)
- [ ] Win fanfare / celebration
- [ ] Your-turn notification (subtle chime)
- [ ] Timer warning (ticking when low)
- [ ] **Sources**: freesound.org, mixkit.co, zapsplat.com (free SFX)
- [ ] Add `<audio>` elements or use Web Audio API in components
- [ ] Add mute/volume toggle in UI

### ANIMATIONS (Code + Design Decisions)
- [ ] **Card flip** — framer-motion is imported but unused. Implement 3D card flip when revealing.
- [ ] **Card slide** — Cards sliding from deck position to player/community positions
- [ ] **Chip movement** — Chips sliding from player to pot on bet/call
- [ ] **Win effect** — Highlight/glow/confetti when winning
- [ ] **Timer ring** — Circular countdown around active player's seat
- [ ] Decide animation durations (fast enough to not annoy, slow enough to register)

### CONFIGURATION & SECRETS
- [ ] Create `frontend/.env.local` from `.env.example`
  - Fill in: `NEXT_PUBLIC_WORLD_ADDRESS`, `NEXT_PUBLIC_TORII_URL`, `NEXT_PUBLIC_RPC_URL`
  - Fill in: All contract system addresses (lobby, game_setup, shuffle, dealing, betting, showdown, settle)
  - Fill in: `NEXT_PUBLIC_GARAGA_API_URL`
- [ ] **For Sepolia**: Fund deployer wallet with testnet ETH + STRK
  - Get from Starknet faucet: https://faucet.goerli.starknet.io (or Sepolia equivalent)
- [ ] **Cartridge Controller**: Check if a project registration is needed
- [ ] **Garaga server**: Decide hosting — localhost for dev, VPS for production

### DEPLOYMENT
- [ ] **Contracts → Sepolia**
  - Edit `contracts/dojo_sepolia.toml` with real account + RPC
  - `sozo migrate apply --profile sepolia`
  - Record all deployed contract addresses
- [ ] **Verifier contracts** — declare + deploy separately on Sepolia
- [ ] **Torii** — run on a server (Fly.io, Railway, VPS) pointing at Sepolia
- [ ] **Garaga server** — run on a server (same or separate)
- [ ] **Frontend → Vercel/Netlify**
  - Create project, link to GitHub repo
  - Set all `NEXT_PUBLIC_*` env vars
  - `npm run build && deploy`
- [ ] **Domain** (optional) — starkpoker.xyz, pokerstarks.com, etc.

### DOCUMENTATION
- [ ] **README.md** in project root — required for hackathon
  - Project description, screenshots, architecture overview
  - How to run locally, how to play
  - Tech stack, credits, license
- [ ] **Project description** — 500 words max (hackathon submission)
- [ ] **Architecture diagram** — visual (draw.io, excalidraw, or hand-drawn)
  - Show: Players ↔ Frontend ↔ Contracts ↔ Noir/Garaga ↔ Dojo/Torii flow

### DEMO VIDEO (3 minutes)
- [ ] Screen recording setup (OBS, Loom, or QuickTime)
- [ ] Script/outline:
  - 0:00–0:20 — Hook: "What if poker was provably fair and fully private?"
  - 0:20–0:45 — Cartridge onboarding: 1 click, no seed phrase
  - 0:45–1:15 — Shuffle with ZK proof: show the progress bar, explain what's happening
  - 1:15–1:45 — Gameplay: private hole cards, betting actions
  - 1:45–2:15 — Privacy: spectator view (can't see cards), mention Tongo
  - 2:15–2:45 — Showdown: cards reveal, winner determined, architecture flash
  - 2:45–3:00 — Closing: GitHub link, team info
- [ ] Record with 2 browser windows visible (2-player game)
- [ ] Edit: trim dead time during proof generation (speed up)
- [ ] Export: MP4, 1080p minimum
- [ ] Upload to YouTube/Loom for submission link

### TONGO INTEGRATION (Stretch Goal)
- [ ] Read docs: https://docs.tongo.cash
- [ ] Implement `useTongo.ts` hook — currently file is missing
- [ ] Create chip wrapper contract (wrap STRK → confidential STRK)
- [ ] Wire confidential transfers into betting (replace `seat.chips` with Tongo balance)
- [ ] Wire confidential distribution into settle/showdown
- [ ] **Fallback**: If too complex, document as "planned feature" in README

### CODE GAPS (Things Claude Can Fix)
- [ ] **`useChat.ts`** — Torii subscription not wired, sendMessage/sendEmote don't call contracts
- [ ] **Missing dev scripts**: `scripts/setup.sh` (install toolchains), `scripts/dev.sh` (start all services), `scripts/deploy.sh` (deploy to Sepolia)
- [ ] **No project README.md** — needs to be written
- [ ] **Circuit recompilation** — A-02 fix changed the circuit source, artifacts in `target/` and `frontend/public/circuits/` are stale (A-08). Need to run nargo compile + bb write_vk + garaga gen.
- [ ] **framer-motion** — imported in package.json but zero animation code written
- [ ] **Mobile responsiveness** — layout is desktop-only, needs responsive breakpoints

---

## 7. Known Issues & Workarounds

| Issue | Workaround |
|-------|------------|
| Garaga server needed for proofs | Run `python scripts/garaga-server.py` locally. Without it, proof→calldata conversion fails. |
| `npm install` peer dep conflicts | Use `npm install --legacy-peer-deps` (React 19 + older starknet-react packages) |
| Turbopack build issues | Already configured — `turbopack: {}` in `next.config.ts` |
| Web Worker SSR crashes | Already guarded with `typeof window === "undefined"` checks |
| Shuffle proof takes 11-15s | Expected. Progress bar in UI. Can't speed up without changing circuit. |
| Decrypt proof takes ~1.5s | Fast enough. No visible delay in UX. |
| Mock data fallback | If Torii is down, frontend shows mock tables. Real game won't work. |
| `useChat` is stubbed | Chat panel renders but messages don't persist. Fix: wire Torii subscription + contract calls. |
| Card SVGs missing | Text rendering fallback works (rank + colored suit symbol). Ugly but functional. |
| No sound effects | Silent game. Not a blocker for demo. |
| Circuit artifacts stale | After A-02 fix, need `nargo compile` + regenerate verifiers. Proofs generated from old circuit won't verify against new verifier. |

---

## Priority Order (What to Test First)

1. **Environment setup** — Get all 4 terminals running. If this doesn't work, nothing else will.
2. **Lobby flow** — Create table + join. Simplest contract interaction.
3. **Betting flow** — Hardcode some game state, test betting actions.
4. **Full E2E** — The big one. 2 players, full hand.
5. **Edge cases** — Side pots, timeouts, hand evaluator rankings.
6. **Frontend polish** — After core works, add graphics/sounds/animations.
7. **Deployment** — Only after everything works locally.
