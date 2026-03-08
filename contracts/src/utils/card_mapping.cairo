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

#[cfg(test)]
mod tests {
    use super::{card_to_rank, card_to_suit, rank_suit_to_card};

    #[test]
    fn test_card_encoding_boundaries() {
        // Card 0 = 2 of clubs
        assert(card_to_rank(0) == 0, '2c rank=0');
        assert(card_to_suit(0) == 0, '2c suit=0');

        // Card 51 = Ace of spades
        assert(card_to_rank(51) == 12, 'As rank=12');
        assert(card_to_suit(51) == 3, 'As suit=3');
    }

    #[test]
    fn test_roundtrip_all_cards() {
        let mut card_id: u8 = 0;
        while card_id < 52 {
            let rank = card_to_rank(card_id);
            let suit = card_to_suit(card_id);
            let reconstructed = rank_suit_to_card(rank, suit);
            assert(reconstructed == card_id, 'roundtrip failed');
            card_id += 1;
        };
    }

    #[test]
    fn test_specific_cards() {
        // King of hearts = rank 11, suit 2
        assert(rank_suit_to_card(11, 2) == 46, 'Kh=46');
        assert(card_to_rank(46) == 11, 'Kh rank');
        assert(card_to_suit(46) == 2, 'Kh suit');

        // 10 of diamonds = rank 8, suit 1
        assert(rank_suit_to_card(8, 1) == 33, '10d=33');
    }
}
