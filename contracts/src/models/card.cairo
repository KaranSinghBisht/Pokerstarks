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
