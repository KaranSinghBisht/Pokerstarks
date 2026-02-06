// Encrypted deck: 52 cards, each card = (C1_x, C1_y, C2_x, C2_y)
// Total: 52 * 4 = 208 felt252 values
// Using Array<felt252> since fixed-size arrays of 208 elements aren't practical

#[derive(Drop, Serde, Debug)]
#[dojo::model]
pub struct EncryptedDeck {
    #[key]
    pub hand_id: u64,
    #[key]
    pub version: u8, // 0 = initial, 1..N = after each player's shuffle
    pub cards: Array<felt252>, // flattened: [c0_c1x, c0_c1y, c0_c2x, c0_c2y, c1_c1x, ...]
}
