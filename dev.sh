#!/usr/bin/env bash
# ============================================================================
# Pokerstarks — Dev Launcher
# Runs all 4 services simultaneously with logging.
# Logs are overwritten on each run.
#
# Usage:   ./dev.sh
# Logs:    logs/katana.log, logs/sozo.log, logs/torii.log, logs/frontend.log
# Stop:    Ctrl+C (kills all background processes)
# ============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"

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

# ─── 1. Katana (local devnet) ───────────────────────────────────────────────
echo -e "${GREEN}[1/4]${NC} Starting Katana devnet..."
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

# ─── 2. Sozo Migrate (deploy contracts) ─────────────────────────────────────
echo -e "${GREEN}[2/4]${NC} Deploying contracts with sozo..."
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

# Extract world address from manifest (more reliable than grepping logs)
WORLD_ADDRESS=""
if command -v jq >/dev/null 2>&1; then
    WORLD_ADDRESS=$(jq -r '.world.address // empty' "$ROOT_DIR/contracts/manifest_dev.json" 2>/dev/null || true)
fi

# Fallback to log grep if jq/manifest parsing is unavailable
if [ -z "${WORLD_ADDRESS}" ] || [ "${WORLD_ADDRESS}" = "null" ]; then
    WORLD_ADDRESS=$(grep -oE '0x[0-9a-fA-F]+' "$LOG_DIR/sozo.log" | head -1 || true)
fi

if [ -z "$WORLD_ADDRESS" ]; then
    echo -e "       ${RED}Could not extract world address from sozo output.${NC}"
    echo -e "       ${YELLOW}Check logs/sozo.log and pass it manually to torii.${NC}"
    exit 1
fi
echo -e "       World address: ${YELLOW}${WORLD_ADDRESS}${NC}"

# ─── 3. Torii (indexer) ─────────────────────────────────────────────────────
echo -e "${GREEN}[3/4]${NC} Starting Torii indexer..."
# Torii CLI flags vary by version; pass the right CORS flag when supported.
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

# Wait for Torii to be ready (port 8080)
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

# ─── 4. Frontend (Next.js dev server) ───────────────────────────────────────
echo -e "${GREEN}[4/4]${NC} Starting frontend dev server..."
cd "$ROOT_DIR/frontend"

# Auto-create .env.local from .env.example if missing, with world address filled in
if [ ! -f ".env.local" ]; then
    echo -e "       ${YELLOW}No .env.local found — creating from .env.example${NC}"
    cp .env.example .env.local
    # Fill in the world address
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|NEXT_PUBLIC_WORLD_ADDRESS=.*|NEXT_PUBLIC_WORLD_ADDRESS=${WORLD_ADDRESS}|" .env.local
    else
        sed -i "s|NEXT_PUBLIC_WORLD_ADDRESS=.*|NEXT_PUBLIC_WORLD_ADDRESS=${WORLD_ADDRESS}|" .env.local
    fi
    echo -e "       ${GREEN}Updated .env.local with world address${NC}"
fi

npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
PIDS+=($!)
echo -e "       PID: $!  →  ${CYAN}logs/frontend.log${NC}"
cd "$ROOT_DIR"

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN} All services running!${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Katana${NC}    http://localhost:5050     logs/katana.log"
echo -e "  ${GREEN}Torii${NC}     http://localhost:8080     logs/torii.log"
echo -e "  ${GREEN}Frontend${NC}  http://localhost:3000     logs/frontend.log"
echo -e "  ${YELLOW}Sozo${NC}      (deploy complete)         logs/sozo.log"
echo ""
echo -e "  World:   ${YELLOW}${WORLD_ADDRESS}${NC}"
echo ""
echo -e "  ${CYAN}Press Ctrl+C to stop all services${NC}"
echo ""

# Tail all logs in real-time so the terminal stays useful
tail -f "$LOG_DIR/katana.log" "$LOG_DIR/torii.log" "$LOG_DIR/frontend.log" &
PIDS+=($!)

# Wait forever (until Ctrl+C)
wait
