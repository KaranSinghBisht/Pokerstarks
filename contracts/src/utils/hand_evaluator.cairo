// Poker hand evaluator
// Evaluates best 5-card hand from 7 cards (2 hole + 5 community)
//
// Hand rankings (higher = better):
//   9 = Straight Flush (includes Royal Flush)
//   8 = Four of a Kind
//   7 = Full House
//   6 = Flush
//   5 = Straight
//   4 = Three of a Kind
//   3 = Two Pair
//   2 = One Pair
//   1 = High Card
//
// Returns (hand_rank: u8, tiebreaker: u32)
// The tiebreaker encodes kickers for comparison

pub fn evaluate_best_hand(cards: Span<u8>) -> (u8, u32) {
    // cards: 7 card IDs (2 hole + 5 community)
    assert(cards.len() == 7, 'need exactly 7 cards');

    // TODO: Test all 21 five-card combinations (7 choose 5)
    // For each combo, evaluate hand rank and tiebreaker
    // Return the best (highest rank, then highest tiebreaker)

    (1_u8, 0_u32) // placeholder: high card, no tiebreaker
}
