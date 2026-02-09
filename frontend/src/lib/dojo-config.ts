export const WORLD_ADDRESS = process.env.NEXT_PUBLIC_WORLD_ADDRESS || "0x0";
export const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
export const TORII_RPC_URL = process.env.NEXT_PUBLIC_TORII_RPC_URL || "http://localhost:5050";
export const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL || "";

// Separate RPC URL for Cartridge Controller / wallet interactions.
// In production this should point to a Sepolia/mainnet RPC (e.g. Alchemy, Blast, Nethermind).
// For local dev, Katana (localhost:5050) serves as both game RPC and wallet RPC.
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || TORII_RPC_URL;

export const NAMESPACE = "pokerstarks";
