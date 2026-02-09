use starknet::ContractAddress;
use super::enums::TableState;

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Table {
    #[key]
    pub table_id: u64,
    pub creator: ContractAddress,
    pub max_players: u8,
    pub small_blind: u128,
    pub big_blind: u128,
    pub min_buy_in: u128,
    pub max_buy_in: u128,
    pub state: TableState,
    pub current_hand_id: u64,
    pub dealer_seat: u8,
    pub player_count: u8,
    pub created_at: u64,
    // Garaga verifier contract addresses (set at table creation)
    pub shuffle_verifier: ContractAddress,
    pub decrypt_verifier: ContractAddress,
    // Rake (house cut) — basis points (250 = 2.5%), capped per hand
    pub rake_bps: u16,
    pub rake_cap: u128,
    pub rake_recipient: ContractAddress,
    // Private table support
    pub is_private: bool,
    pub invite_code_hash: felt252,
    // STRK token address for real deposits
    pub token_address: ContractAddress,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Seat {
    #[key]
    pub table_id: u64,
    #[key]
    pub seat_index: u8,
    pub player: ContractAddress,
    pub chips: u128,
    pub is_occupied: bool,
    pub is_ready: bool,
    pub is_sitting_out: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct TableCounter {
    #[key]
    pub singleton: u8,
    pub next_id: u64,
}
