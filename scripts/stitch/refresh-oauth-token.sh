#!/usr/bin/env bash
set -euo pipefail

# Refreshes an OAuth access token for Stitch MCP (requires gcloud + ADC login).
# Writes a local .env in the current directory (default: repo root).
#
# Usage:
#   PROJECT_ID="your-gcp-project" ./scripts/stitch/refresh-oauth-token.sh
# Or:
#   ./scripts/stitch/refresh-oauth-token.sh your-gcp-project
#
# This script intentionally does not edit any IDE config files; copy the token
# into your client config header as needed.

PROJECT_ID="${PROJECT_ID:-${1:-}}"
if [[ -z "${PROJECT_ID}" ]]; then
  echo "error: PROJECT_ID is required (env var or first arg)" >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "error: gcloud not found. Install Google Cloud SDK first." >&2
  exit 1
fi

TOKEN="$(gcloud auth application-default print-access-token)"

{
  echo "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"
  echo "STITCH_ACCESS_TOKEN=${TOKEN}"
} > .env

echo "Wrote GOOGLE_CLOUD_PROJECT and STITCH_ACCESS_TOKEN to .env"

