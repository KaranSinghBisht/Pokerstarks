// Card ID encoding:
//   0 = 2 of clubs,   1 = 2 of diamonds,  2 = 2 of hearts,  3 = 2 of spades
//   4 = 3 of clubs,   5 = 3 of diamonds,  6 = 3 of hearts,  7 = 3 of spades
//   ...
//  48 = A of clubs,  49 = A of diamonds, 50 = A of hearts, 51 = A of spades

// Ranks: 0=2, 1=3, 2=4, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
// Suits: 0=clubs, 1=diamonds, 2=hearts, 3=spades

pub fn card_to_rank(card_id: u8) -> u8 {
    card_id / 4
}

pub fn card_to_suit(card_id: u8) -> u8 {
    card_id % 4
}

pub fn rank_suit_to_card(rank: u8, suit: u8) -> u8 {
    rank * 4 + suit
}
