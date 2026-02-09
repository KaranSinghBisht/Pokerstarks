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

// STRK token address on Sepolia
pub const STRK_TOKEN_SEPOLIA: felt252 =
    0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d;
