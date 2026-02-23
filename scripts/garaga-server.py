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
from importlib import import_module
from collections.abc import Mapping
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

_garaga_loaded = False
_garaga_calldata_fn: Any = None
_garaga_honk_vk_cls: Any = None
_garaga_proof_cls: Any = None

# Path to VK files
SCRIPT_DIR = Path(__file__).parent.parent
VK_PATHS = {
    "shuffle": SCRIPT_DIR / "circuits" / "shuffle_proof" / "target" / "keccak" / "vk",
    "decrypt": SCRIPT_DIR / "circuits" / "decrypt_proof" / "target" / "keccak" / "vk",
}

# Cache loaded VKs
_vk_cache = {}


def parse_allowed_origins(raw: str | None) -> set[str]:
    if raw is None or raw.strip() == "":
        return {
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        }

    values = {item.strip() for item in raw.split(",") if item.strip()}
    return values


def bool_from_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def ensure_garaga_loaded() -> None:
    global _garaga_loaded
    global _garaga_calldata_fn
    global _garaga_honk_vk_cls
    global _garaga_proof_cls

    if _garaga_loaded:
        return

    try:
        calldata_module = import_module(
            "garaga.starknet.honk_contract_generator.calldata"
        )
        honk_module = import_module("garaga.precompiled_circuits.honk")
    except ImportError as exc:
        raise RuntimeError(
            "garaga not installed. Run: pip install garaga==1.0.1"
        ) from exc

    _garaga_calldata_fn = (
        calldata_module.get_ultra_keccak_honk_calldata_from_vk_and_proof
    )
    _garaga_honk_vk_cls = honk_module.HonkVk
    _garaga_proof_cls = honk_module.ZKUltraKeccakHonkProof
    _garaga_loaded = True


def load_vk(circuit_type: str) -> Any:
    ensure_garaga_loaded()

    if circuit_type not in _vk_cache:
        vk_path = VK_PATHS[circuit_type]
        if not vk_path.exists():
            raise FileNotFoundError(f"VK not found: {vk_path}")
        with open(vk_path, "rb") as f:
            vk_bytes = f.read()
        _vk_cache[circuit_type] = _garaga_honk_vk_cls.from_bytes(vk_bytes)
    return _vk_cache[circuit_type]


class CalldataHandler(BaseHTTPRequestHandler):
    allowed_origins: set[str] = parse_allowed_origins(
        os.environ.get("GARAGA_ALLOWED_ORIGINS")
    )
    max_body_bytes: int = int(os.environ.get("GARAGA_MAX_BODY_BYTES", "1048576"))
    debug_errors: bool = bool_from_env("GARAGA_DEBUG_ERRORS", default=False)

    def _request_origin(self) -> str | None:
        return self.headers.get("Origin")

    def _origin_allowed(self, origin: str | None) -> bool:
        if origin is None:
            return True

        if "*" in self.allowed_origins:
            return True

        return origin in self.allowed_origins

    def _set_cors_headers(self, origin: str | None) -> None:
        if origin and self._origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(
        self,
        status_code: int,
        payload: Mapping[str, Any],
        origin: str | None = None,
    ) -> None:
        self.send_response(status_code)
        self._set_cors_headers(origin)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_OPTIONS(self) -> None:
        origin = self._request_origin()

        if not self._origin_allowed(origin):
            self._send_json(403, {"error": "Origin not allowed"}, origin)
            return

        self.send_response(204)
        self._set_cors_headers(origin)
        self.end_headers()

    def do_POST(self) -> None:
        origin = self._request_origin()

        if not self._origin_allowed(origin):
            self._send_json(403, {"error": "Origin not allowed"}, origin)
            return

        if self.path != "/generate-calldata":
            self._send_json(404, {"error": "Not found"}, origin)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            self._send_json(400, {"error": "Empty request body"}, origin)
            return

        if content_length > self.max_body_bytes:
            self._send_json(
                413,
                {
                    "error": (
                        f"Request body too large ({content_length} bytes). "
                        f"Max allowed is {self.max_body_bytes} bytes."
                    )
                },
                origin,
            )
            return

        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON payload"}, origin)
            return

        if not isinstance(data, dict):
            self._send_json(400, {"error": "JSON payload must be an object"}, origin)
            return

        circuit = data.get("circuit")
        proof_hex = data.get("proof_hex")
        public_inputs = data.get("public_inputs")

        if circuit not in VK_PATHS:
            self._send_json(
                400, {"error": "circuit must be 'shuffle' or 'decrypt'"}, origin
            )
            return

        if not isinstance(proof_hex, str) or proof_hex.strip() == "":
            self._send_json(
                400, {"error": "proof_hex must be a non-empty hex string"}, origin
            )
            return

        if len(proof_hex) % 2 != 0:
            self._send_json(400, {"error": "proof_hex must have even length"}, origin)
            return

        if not isinstance(public_inputs, list):
            self._send_json(400, {"error": "public_inputs must be an array"}, origin)
            return

        if len(public_inputs) > 1024:
            self._send_json(400, {"error": "public_inputs too long"}, origin)
            return

        try:
            proof_bytes = bytes.fromhex(proof_hex)
        except ValueError:
            self._send_json(400, {"error": "proof_hex is not valid hex"}, origin)
            return

        try:
            ensure_garaga_loaded()

            # Load VK
            vk = load_vk(circuit)

            # Convert public inputs to bytes
            pi_values = [
                int(x, 16) if x.startswith("0x") else int(x) for x in public_inputs
            ]

            # Parse proof
            proof = _garaga_proof_cls.from_bytes(proof_bytes, pi_values, vk)

            # Generate full calldata with hints
            calldata = _garaga_calldata_fn(vk, proof, use_rust=True)

            # Return as JSON array of string felt252s
            result = {"calldata": [str(x) for x in calldata]}
            self._send_json(200, result, origin)

        except Exception as e:
            if self.debug_errors:
                message = str(e)
            else:
                message = "Calldata generation failed"
            self._send_json(500, {"error": message}, origin)

    def log_message(self, format: str, *args: object) -> None:
        print(f"[garaga-server] {format % args}")


if __name__ == "__main__":
    host = os.environ.get("GARAGA_HOST", "127.0.0.1")
    port = int(os.environ.get("GARAGA_PORT", "3001"))
    server = HTTPServer((host, port), CalldataHandler)
    print(f"Garaga calldata server running on http://{host}:{port}")
    print(f"Allowed origins: {sorted(CalldataHandler.allowed_origins)}")
    print(f"Max body bytes: {CalldataHandler.max_body_bytes}")
    print(f"VK paths: {VK_PATHS}")
    server.serve_forever()
