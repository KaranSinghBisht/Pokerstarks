#!/usr/bin/env bash
# ============================================================================
# Pokerstarks — Dev Launcher
#
# Modes:
#   ./dev.sh              Local Katana: starts Katana + sozo migrate + Torii +
#                         Garaga server + Frontend (4-5 services)
#   ./dev.sh --sepolia    Sepolia testnet: starts Garaga server + Frontend only
#                         (uses existing .env.local with deployed addresses)
#
# Logs:    logs/*.log (overwritten each run)
# Stop:    Ctrl+C (kills all background processes)
# ============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"

# ─── Parse flags ──────────────────────────────────────────────────────────────
MODE="local"
SKIP_GARAGA=false
for arg in "$@"; do
    case "$arg" in
        --sepolia)   MODE="sepolia" ;;
        --no-garaga) SKIP_GARAGA=true ;;
        --help|-h)
            echo "Usage: ./dev.sh [--sepolia] [--no-garaga]"
            echo ""
            echo "  (no flags)   Local Katana mode: Katana + sozo + Torii + Garaga + Frontend"
            echo "  --sepolia    Sepolia mode: Garaga server + Frontend only"
            echo "  --no-garaga  Skip starting the Garaga calldata server"
            exit 0
            ;;
        *)
            echo "Unknown flag: $arg (try --help)"
            exit 1
            ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Create / clean log directory (overwrites previous logs on each run)
rm -rf "$LOG_DIR"
mkdir -p "$LOG_DIR"

# Track PIDs for cleanup
PIDS=()
CLEANED_UP=0

cleanup() {
    if [ "$CLEANED_UP" -eq 1 ]; then
        return 0
    fi
    CLEANED_UP=1
    trap - SIGINT SIGTERM EXIT
    echo ""
    echo -e "${YELLOW}[dev.sh] Shutting down all services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    # Kill any remaining child processes
    jobs -p | xargs -r kill 2>/dev/null || true
    wait 2>/dev/null || true
    echo -e "${GREEN}[dev.sh] All services stopped. Logs saved in ${LOG_DIR}/${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           ♠ STARK POKER — Dev Environment ♠          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$MODE" = "sepolia" ]; then
    echo -e "  Mode: ${YELLOW}SEPOLIA TESTNET${NC}"
else
    echo -e "  Mode: ${GREEN}LOCAL KATANA${NC}"
fi
echo ""

# ─── npm install check ────────────────────────────────────────────────────────
if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo -e "${GREEN}[0/x]${NC} Installing frontend dependencies..."
    cd "$ROOT_DIR/frontend"
    npm install > "$LOG_DIR/npm-install.log" 2>&1
    cd "$ROOT_DIR"
    echo -e "       ${GREEN}Done!${NC}  →  ${CYAN}logs/npm-install.log${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# LOCAL KATANA MODE
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$MODE" = "local" ]; then

    # ─── 1. Katana (local devnet) ─────────────────────────────────────────────
    echo -e "${GREEN}[1/5]${NC} Starting Katana devnet..."
    katana --dev --dev.no-fee > "$LOG_DIR/katana.log" 2>&1 &
    PIDS+=($!)
    echo -e "       PID: $!  →  ${CYAN}logs/katana.log${NC}"

    # Wait for Katana to be ready (port 5050)
    echo -n "       Waiting for Katana..."
    for i in $(seq 1 30); do
        if curl -s http://localhost:5050 > /dev/null 2>&1; then
            echo -e " ${GREEN}ready!${NC}"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo -e " ${RED}TIMEOUT — check logs/katana.log${NC}"
            exit 1
        fi
        sleep 1
        echo -n "."
    done

    # ─── 2. Sozo Migrate (deploy contracts) ───────────────────────────────────
    echo -e "${GREEN}[2/5]${NC} Deploying contracts with sozo..."
    cd "$ROOT_DIR/contracts"
    SCARB_LOCK_GLOB="$HOME/Library/Caches/com.swmansion.scarb/registry/cache/"*.redb.lock
    if compgen -G "$SCARB_LOCK_GLOB" > /dev/null; then
        echo -e "       ${YELLOW}Detected scarb lock file(s). If migrate hangs, another scarb/sozo process may hold the lock.${NC}"
    fi
    echo -e "       Command: ${CYAN}sozo migrate -P dev -v --private-key \$DOJO_PRIVATE_KEY${NC}"
    echo -e "       ${YELLOW}(First run can take several minutes while scarb resolves/builds dependencies.)${NC}"

    if [ -z "${DOJO_PRIVATE_KEY:-}" ]; then
        echo -e "       ${RED}DOJO_PRIVATE_KEY is not set.${NC}"
        echo -e "       ${YELLOW}Export your local Katana private key before running dev.sh.${NC}"
        echo -e "       ${YELLOW}Example: export DOJO_PRIVATE_KEY=0x...${NC}"
        exit 1
    fi

    SOZO_MIGRATE_CMD=(sozo migrate -P dev -v --private-key "$DOJO_PRIVATE_KEY")

    SOZO_START_TS=$(date +%s)
    if ! "${SOZO_MIGRATE_CMD[@]}" 2>&1 | tee "$LOG_DIR/sozo.log"; then
        cd "$ROOT_DIR"
        echo -e "       ${RED}sozo migrate FAILED — check logs/sozo.log${NC}"
        exit 1
    fi

    SOZO_END_TS=$(date +%s)
    SOZO_DURATION=$((SOZO_END_TS - SOZO_START_TS))
    cd "$ROOT_DIR"
    echo -e "       ${GREEN}Contracts deployed!${NC}  →  ${CYAN}logs/sozo.log${NC}"
    echo -e "       Duration: ${YELLOW}${SOZO_DURATION}s${NC}"

    # Extract world address from manifest
    WORLD_ADDRESS=""
    if command -v jq >/dev/null 2>&1; then
        WORLD_ADDRESS=$(jq -r '.world.address // empty' "$ROOT_DIR/contracts/manifest_dev.json" 2>/dev/null || true)
    fi
    if [ -z "${WORLD_ADDRESS}" ] || [ "${WORLD_ADDRESS}" = "null" ]; then
        WORLD_ADDRESS=$(grep -oE '0x[0-9a-fA-F]+' "$LOG_DIR/sozo.log" | head -1 || true)
    fi
    if [ -z "$WORLD_ADDRESS" ]; then
        echo -e "       ${RED}Could not extract world address from sozo output.${NC}"
        echo -e "       ${YELLOW}Check logs/sozo.log and pass it manually to torii.${NC}"
        exit 1
    fi
    echo -e "       World address: ${YELLOW}${WORLD_ADDRESS}${NC}"

    # ─── Extract system contract addresses from manifest ──────────────────────
    MANIFEST="$ROOT_DIR/contracts/manifest_dev.json"
    if command -v jq >/dev/null 2>&1 && [ -f "$MANIFEST" ]; then
        echo -e "       Extracting system addresses from manifest..."

        # Map system tag suffixes to env var names
        declare -A SYS_MAP=(
            ["lobby_system"]="NEXT_PUBLIC_LOBBY_ADDRESS"
            ["game_setup_system"]="NEXT_PUBLIC_GAME_SETUP_ADDRESS"
            ["shuffle_system"]="NEXT_PUBLIC_SHUFFLE_ADDRESS"
            ["dealing_system"]="NEXT_PUBLIC_DEALING_ADDRESS"
            ["betting_system"]="NEXT_PUBLIC_BETTING_ADDRESS"
            ["showdown_system"]="NEXT_PUBLIC_SHOWDOWN_ADDRESS"
            ["settle_system"]="NEXT_PUBLIC_SETTLE_ADDRESS"
            ["timeout_system"]="NEXT_PUBLIC_TIMEOUT_ADDRESS"
            ["chat_system"]="NEXT_PUBLIC_CHAT_ADDRESS"
        )

        for sys_suffix in "${!SYS_MAP[@]}"; do
            addr=$(jq -r ".contracts[] | select(.tag | endswith(\"$sys_suffix\")) | .address // empty" "$MANIFEST" 2>/dev/null || true)
            if [ -n "$addr" ] && [ "$addr" != "null" ]; then
                eval "${SYS_MAP[$sys_suffix]}=$addr"
            fi
        done
    fi

    # ─── 3. Torii (indexer) ───────────────────────────────────────────────────
    echo -e "${GREEN}[3/5]${NC} Starting Torii indexer..."
    TORII_CMD=(torii --world "$WORLD_ADDRESS")
    TORII_HELP="$(torii --help 2>&1 || true)"
    if printf '%s' "$TORII_HELP" | grep -q -- "--http.cors_origins"; then
        TORII_CMD+=(--http.cors_origins "*")
    elif printf '%s' "$TORII_HELP" | grep -q -- "--allowed-origins"; then
        TORII_CMD+=(--allowed-origins "*")
    fi
    "${TORII_CMD[@]}" > "$LOG_DIR/torii.log" 2>&1 &
    PIDS+=($!)
    echo -e "       PID: $!  →  ${CYAN}logs/torii.log${NC}"

    echo -n "       Waiting for Torii..."
    for i in $(seq 1 30); do
        if curl -s http://localhost:8080 > /dev/null 2>&1; then
            echo -e " ${GREEN}ready!${NC}"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo -e " ${YELLOW}TIMEOUT — torii may still be starting, check logs/torii.log${NC}"
            break
        fi
        sleep 1
        echo -n "."
    done

    # ─── Write .env.local for local dev ───────────────────────────────────────
    ENV_FILE="$ROOT_DIR/frontend/.env.local"
    echo -e "       Writing ${CYAN}.env.local${NC} for local Katana..."

    if [ ! -f "$ENV_FILE" ]; then
        cp "$ROOT_DIR/frontend/.env.example" "$ENV_FILE"
    fi

    # Helper: update or append a key=value in .env.local
    update_env() {
        local key="$1" val="$2" file="$3"
        if grep -q "^${key}=" "$file"; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|^${key}=.*|${key}=${val}|" "$file"
            else
                sed -i "s|^${key}=.*|${key}=${val}|" "$file"
            fi
        else
            echo "${key}=${val}" >> "$file"
        fi
    }

    update_env "NEXT_PUBLIC_WORLD_ADDRESS" "$WORLD_ADDRESS" "$ENV_FILE"
    update_env "NEXT_PUBLIC_TORII_URL" "http://localhost:8080" "$ENV_FILE"
    update_env "NEXT_PUBLIC_TORII_RPC_URL" "http://localhost:5050" "$ENV_FILE"
    update_env "NEXT_PUBLIC_RPC_URL" "http://localhost:5050" "$ENV_FILE"

    # Write system contract addresses if extracted
    for sys_suffix in "${!SYS_MAP[@]}"; do
        env_key="${SYS_MAP[$sys_suffix]}"
        addr="${!env_key:-}"
        if [ -n "$addr" ]; then
            update_env "$env_key" "$addr" "$ENV_FILE"
        fi
    done

    echo -e "       ${GREEN}.env.local updated with Katana addresses${NC}"

fi # end local mode

# ═══════════════════════════════════════════════════════════════════════════════
# SEPOLIA MODE — validate .env.local
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$MODE" = "sepolia" ]; then
    ENV_FILE="$ROOT_DIR/frontend/.env.local"
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "  ${RED}.env.local not found!${NC}"
        echo -e "  ${YELLOW}Copy .env.example to .env.local and fill in Sepolia addresses.${NC}"
        exit 1
    fi

    # Quick sanity check: world address should not be 0x0
    if grep -q "^NEXT_PUBLIC_WORLD_ADDRESS=0x0$" "$ENV_FILE" 2>/dev/null; then
        echo -e "  ${RED}NEXT_PUBLIC_WORLD_ADDRESS is 0x0 in .env.local${NC}"
        echo -e "  ${YELLOW}Set your Sepolia world address before running --sepolia mode.${NC}"
        exit 1
    fi

    echo -e "  ${GREEN}.env.local found with Sepolia config${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# GARAGA SERVER (both modes)
# ═══════════════════════════════════════════════════════════════════════════════
STEP_GARAGA="4"
STEP_FRONTEND="5"
if [ "$MODE" = "sepolia" ]; then
    STEP_GARAGA="1"
    STEP_FRONTEND="2"
fi

if [ "$SKIP_GARAGA" = true ]; then
    echo -e "${YELLOW}[${STEP_GARAGA}/x]${NC} Garaga server skipped (--no-garaga)"
else
    echo -e "${GREEN}[${STEP_GARAGA}/x]${NC} Starting Garaga calldata server..."

    # Check VK files exist
    SHUFFLE_VK="$ROOT_DIR/circuits/shuffle_proof/target/keccak/vk"
    DECRYPT_VK="$ROOT_DIR/circuits/decrypt_proof/target/keccak/vk"
    if [ ! -f "$SHUFFLE_VK" ] || [ ! -f "$DECRYPT_VK" ]; then
        echo -e "       ${RED}Missing circuit VK files:${NC}"
        [ ! -f "$SHUFFLE_VK" ] && echo -e "       ${RED}  - $SHUFFLE_VK${NC}"
        [ ! -f "$DECRYPT_VK" ] && echo -e "       ${RED}  - $DECRYPT_VK${NC}"
        echo -e "       ${YELLOW}Compile circuits first: cd circuits/shuffle_proof && nargo compile && bb write_vk ...${NC}"
        echo -e "       ${YELLOW}Continuing without Garaga server — shuffle proofs will fail.${NC}"
        SKIP_GARAGA=true
    fi

    if [ "$SKIP_GARAGA" = false ]; then
        # Try to find a Python with garaga installed
        GARAGA_PYTHON=""

        # Check common venv locations
        for venv_path in "$ROOT_DIR/.venv" "$ROOT_DIR/venv" "$HOME/.garaga-venv"; do
            if [ -f "$venv_path/bin/python" ]; then
                if "$venv_path/bin/python" -c "import garaga" 2>/dev/null; then
                    GARAGA_PYTHON="$venv_path/bin/python"
                    break
                fi
            fi
        done

        # Fallback to system python
        if [ -z "$GARAGA_PYTHON" ]; then
            for pybin in python3.10 python3 python; do
                if command -v "$pybin" >/dev/null 2>&1; then
                    if "$pybin" -c "import garaga" 2>/dev/null; then
                        GARAGA_PYTHON="$pybin"
                        break
                    fi
                fi
            done
        fi

        if [ -z "$GARAGA_PYTHON" ]; then
            echo -e "       ${RED}garaga Python package not found.${NC}"
            echo -e "       ${YELLOW}Install it:${NC}"
            echo -e "         python3.10 -m venv .venv"
            echo -e "         source .venv/bin/activate"
            echo -e "         pip install garaga==1.0.1"
            echo -e "       ${YELLOW}Then re-run dev.sh. Continuing without Garaga server.${NC}"
        else
            GARAGA_VERSION=$("$GARAGA_PYTHON" -c "import garaga; print(garaga.__version__)" 2>/dev/null || echo "unknown")
            echo -e "       Python: ${CYAN}$GARAGA_PYTHON${NC} (garaga ${GARAGA_VERSION})"
            GARAGA_ALLOWED_ORIGINS="*" "$GARAGA_PYTHON" "$ROOT_DIR/scripts/garaga-server.py" > "$LOG_DIR/garaga.log" 2>&1 &
            PIDS+=($!)
            echo -e "       PID: $!  →  ${CYAN}logs/garaga.log${NC}"

            # Wait for Garaga server
            echo -n "       Waiting for Garaga..."
            for i in $(seq 1 15); do
                if curl -s http://localhost:3001 > /dev/null 2>&1; then
                    echo -e " ${GREEN}ready!${NC}"
                    break
                fi
                if [ "$i" -eq 15 ]; then
                    echo -e " ${YELLOW}TIMEOUT — check logs/garaga.log${NC}"
                    break
                fi
                sleep 1
                echo -n "."
            done
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# FRONTEND (both modes)
# ═══════════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}[${STEP_FRONTEND}/x]${NC} Starting frontend dev server..."
cd "$ROOT_DIR/frontend"
npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
PIDS+=($!)
echo -e "       PID: $!  →  ${CYAN}logs/frontend.log${NC}"
cd "$ROOT_DIR"

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN} All services running!${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$MODE" = "local" ]; then
    echo -e "  ${GREEN}Katana${NC}    http://localhost:5050     logs/katana.log"
    echo -e "  ${GREEN}Torii${NC}     http://localhost:8080     logs/torii.log"
    echo -e "  ${YELLOW}Sozo${NC}      (deploy complete)         logs/sozo.log"
    echo -e "  World:   ${YELLOW}${WORLD_ADDRESS}${NC}"
fi

if [ "$SKIP_GARAGA" = false ] && [ -n "${GARAGA_PYTHON:-}" ]; then
    echo -e "  ${GREEN}Garaga${NC}    http://localhost:3001     logs/garaga.log"
else
    echo -e "  ${YELLOW}Garaga${NC}    (not running)             ${RED}shuffle proofs will fail${NC}"
fi

echo -e "  ${GREEN}Frontend${NC}  http://localhost:3000     logs/frontend.log"
echo ""

# Check bot configuration
if grep -q "^BOT_PRIVATE_KEY_1=0x" "$ROOT_DIR/frontend/.env.local" 2>/dev/null; then
    BOT_COUNT=$(grep -c "^BOT_PRIVATE_KEY_[0-9]=0x" "$ROOT_DIR/frontend/.env.local" 2>/dev/null || echo "0")
    echo -e "  ${GREEN}Bots${NC}      ${BOT_COUNT} bot account(s) configured"
else
    echo -e "  ${YELLOW}Bots${NC}      Not configured — run: ${CYAN}node scripts/setup-bots.js${NC}"
fi

echo ""
echo -e "  ${CYAN}Press Ctrl+C to stop all services${NC}"
echo ""

# Tail all logs in real-time
LOG_FILES=("$LOG_DIR/frontend.log")
[ -f "$LOG_DIR/katana.log" ] && LOG_FILES+=("$LOG_DIR/katana.log")
[ -f "$LOG_DIR/torii.log" ] && LOG_FILES+=("$LOG_DIR/torii.log")
[ -f "$LOG_DIR/garaga.log" ] && LOG_FILES+=("$LOG_DIR/garaga.log")

tail -f "${LOG_FILES[@]}" &
PIDS+=($!)

# Wait forever (until Ctrl+C)
wait
