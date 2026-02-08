#!/usr/bin/env python3
"""
Minimal HTTP server for Garaga calldata generation.

Receives a proof + VK from the frontend, runs Garaga's hint computation,
and returns the full calldata (proof + MSM hints + KZG hints) as felt252[].

Usage:
    python scripts/garaga-server.py

Requires:
    pip install garaga==1.0.1 flask
    (in a Python 3.10 venv)
"""

import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Add Garaga to path
try:
    from garaga.starknet.honk_contract_generator.calldata import (
        get_ultra_keccak_honk_calldata_from_vk_and_proof,
    )
    from garaga.precompiled_circuits.honk import HonkVk, ZKUltraKeccakHonkProof
except ImportError:
    print("ERROR: garaga not installed. Run: pip install garaga==1.0.1")
    sys.exit(1)

# Path to VK files
SCRIPT_DIR = Path(__file__).parent.parent
VK_PATHS = {
    "shuffle": SCRIPT_DIR / "circuits" / "shuffle_proof" / "target" / "keccak" / "vk",
    "decrypt": SCRIPT_DIR / "circuits" / "decrypt_proof" / "target" / "keccak" / "vk",
}

# Cache loaded VKs
_vk_cache = {}


def load_vk(circuit_type: str) -> HonkVk:
    if circuit_type not in _vk_cache:
        vk_path = VK_PATHS[circuit_type]
        if not vk_path.exists():
            raise FileNotFoundError(f"VK not found: {vk_path}")
        with open(vk_path, "rb") as f:
            vk_bytes = f.read()
        _vk_cache[circuit_type] = HonkVk.from_bytes(vk_bytes)
    return _vk_cache[circuit_type]


class CalldataHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path != "/generate-calldata":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        data = json.loads(body)

        circuit = data["circuit"]
        proof_hex = data["proof_hex"]
        public_inputs = data["public_inputs"]

        try:
            # Load VK
            vk = load_vk(circuit)

            # Convert hex proof to bytes
            proof_bytes = bytes.fromhex(proof_hex)

            # Convert public inputs to bytes
            pi_values = [int(x, 16) if x.startswith("0x") else int(x)
                         for x in public_inputs]

            # Parse proof
            proof = ZKUltraKeccakHonkProof.from_bytes(
                proof_bytes, pi_values, vk
            )

            # Generate full calldata with hints
            calldata = get_ultra_keccak_honk_calldata_from_vk_and_proof(
                vk, proof, use_rust=True
            )

            # Return as JSON array of string felt252s
            result = {"calldata": [str(x) for x in calldata]}

            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self.send_response(500)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        print(f"[garaga-server] {format % args}")


if __name__ == "__main__":
    port = int(os.environ.get("GARAGA_PORT", "3001"))
    server = HTTPServer(("0.0.0.0", port), CalldataHandler)
    print(f"Garaga calldata server running on http://0.0.0.0:{port}")
    print(f"VK paths: {VK_PATHS}")
    server.serve_forever()
