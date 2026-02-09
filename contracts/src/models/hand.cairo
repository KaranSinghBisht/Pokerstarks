use starknet::ContractAddress;
use super::enums::GamePhase;

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Hand {
    #[key]
    pub hand_id: u64,
    pub table_id: u64,
    pub phase: GamePhase,
    pub pot: u128,
    pub current_bet: u128,
    pub active_players: u8,
    pub num_players: u8,
    pub current_turn_seat: u8,
    pub dealer_seat: u8,
    pub shuffle_progress: u8,
    pub started_at: u64,
    pub phase_deadline: u64,
    // Aggregate public key for this hand
    pub agg_pub_key_x: felt252,
    pub agg_pub_key_y: felt252,
    pub keys_submitted: u8,
    // Number of players who have submitted matching aggregate key
    pub agg_key_confirmations: u8,
    // Deterministic deck seed (Poseidon hash of hand_id + block timestamp)
    pub deck_seed: felt252,
    // Number of players who submitted matching initial deck hash
    pub deck_hash_confirmations: u8,
    // Hash of the accepted initial deck
    pub initial_deck_hash: felt252,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct PlayerHand {
    #[key]
    pub hand_id: u64,
    #[key]
    pub seat_index: u8,
    pub player: ContractAddress,
    pub public_key_x: felt252,
    pub public_key_y: felt252,
    pub bet_this_round: u128,
    pub total_bet: u128,
    pub has_folded: bool,
    pub has_acted: bool,
    pub is_all_in: bool,
    // Hole card positions in the shuffled deck
    pub hole_card_1_pos: u8,
    pub hole_card_2_pos: u8,
    // Revealed card ids (set during showdown, 255 = not revealed)
    pub hole_card_1_id: u8,
    pub hole_card_2_id: u8,
    // Submitted aggregate key for consensus (Phase 2A)
    pub submitted_agg_x: felt252,
    pub submitted_agg_y: felt252,
    // Submitted initial deck hash for consensus (Phase 2C)
    pub submitted_deck_hash: felt252,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct HandCounter {
    #[key]
    pub singleton: u8,
    pub next_id: u64,
}
