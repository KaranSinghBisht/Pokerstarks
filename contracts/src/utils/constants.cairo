// Timeout durations (in seconds)
pub const SETUP_TIMEOUT: u64 = 30;
pub const SHUFFLE_TIMEOUT: u64 = 60;
pub const DEALING_TIMEOUT: u64 = 30;
pub const BETTING_TIMEOUT: u64 = 45;
pub const SHOWDOWN_TIMEOUT: u64 = 30;

// Table limits
pub const MIN_PLAYERS: u8 = 2;
pub const MAX_PLAYERS: u8 = 6;
pub const DECK_SIZE: u8 = 52;
pub const CARDS_PER_PLAYER: u8 = 2;

// Card encoding: 52 cards, 4 coordinates each (C1_x, C1_y, C2_x, C2_y)
pub const ENCRYPTED_DECK_SIZE: u32 = 208; // 52 * 4

// Undealt card marker
pub const CARD_NOT_DEALT: u8 = 255;

// Rake limits
pub const MAX_RAKE_BPS: u16 = 1000; // Max 10%

// A-01 NOTE: Grumpkin curve is defined over the BN254 scalar field.
// The BN254 scalar field prime (r ≈ 2.19e76) is LARGER than the Starknet
// felt252 modulus (p ≈ 3.62e75). However, all Grumpkin coordinates used
// in this protocol (generator, encrypted cards, reveal tokens) have values
// that fit within felt252. The try_into().unwrap() conversion will panic
// (revert the transaction) if a coordinate ever exceeds felt252 modulus,
// providing a safe guard against silent truncation.

// Grumpkin curve generator point (y^2 = x^3 - 17)
pub const GEN_X: felt252 = 1;
pub const GEN_Y: felt252 = 17631683881184975370165255887551781615748388533673675138860;

// STRK token address on Sepolia
pub const STRK_TOKEN_SEPOLIA: felt252 =
    0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d;
