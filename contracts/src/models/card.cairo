// Reveal tokens: each player submits their partial decryption token
// for each card that needs to be revealed

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct RevealToken {
    #[key]
    pub hand_id: u64,
    #[key]
    pub card_position: u8, // 0-51, position in the shuffled deck
    #[key]
    pub player_seat: u8, // which player submitted this token
    pub token_x: felt252,
    pub token_y: felt252,
    pub proof_verified: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct CommunityCards {
    #[key]
    pub hand_id: u64,
    // Card IDs (0-51), 255 = not yet dealt
    pub flop_1: u8,
    pub flop_2: u8,
    pub flop_3: u8,
    pub turn: u8,
    pub river: u8,
    // Card positions in the shuffled deck (which indices to reveal)
    pub flop_1_pos: u8,
    pub flop_2_pos: u8,
    pub flop_3_pos: u8,
    pub turn_pos: u8,
    pub river_pos: u8,
}

// Card decryption votes for consensus-based card verification (F-03).
// All active players must agree on the decrypted card ID for each position.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct CardDecryptionVote {
    #[key]
    pub hand_id: u64,
    #[key]
    pub card_position: u8,
    #[key]
    pub voter_seat: u8,
    pub card_id: u8,
    pub submitted: bool,
}

// Side pots for all-in scenarios
// pot_index 0 = main pot, 1+ = side pots (in order of creation)
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct SidePot {
    #[key]
    pub hand_id: u64,
    #[key]
    pub pot_index: u8,
    pub amount: u128,
    // Bitmask of seats eligible to win this pot (bit N = seat N)
    pub eligible_mask: u8,
}
