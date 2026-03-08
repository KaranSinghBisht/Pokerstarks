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
// Tiebreaker encoding: pack up to 5 rank values into a u32 (most significant first)
// Each rank occupies 4 bits: tiebreaker = r1*16^4 + r2*16^3 + r3*16^2 + r4*16 + r5

use crate::utils::card_mapping::{card_to_rank, card_to_suit};

pub fn evaluate_best_hand(cards: Span<u8>) -> (u8, u32) {
    assert(cards.len() == 7, 'need exactly 7 cards');

    let mut best_rank: u8 = 0;
    let mut best_tiebreaker: u32 = 0;

    // Enumerate all 21 five-card combinations (7 choose 5)
    // We pick 5 out of 7 by choosing which 2 to exclude
    let mut i: u32 = 0;
    while i < 7 {
        let mut j: u32 = i + 1;
        while j < 7 {
            // Build 5-card hand excluding indices i and j
            let mut hand: Array<u8> = array![];
            let mut k: u32 = 0;
            while k < 7 {
                if k != i && k != j {
                    hand.append(*cards.at(k));
                }
                k += 1;
            };

            let (rank, tb) = evaluate_five(hand.span());
            if rank > best_rank || (rank == best_rank && tb > best_tiebreaker) {
                best_rank = rank;
                best_tiebreaker = tb;
            }

            j += 1;
        };
        i += 1;
    };

    (best_rank, best_tiebreaker)
}

// Evaluate exactly 5 cards
fn evaluate_five(cards: Span<u8>) -> (u8, u32) {
    assert(cards.len() == 5, 'need exactly 5 cards');

    // Extract ranks and suits
    let mut ranks: Array<u8> = array![];
    let mut suits: Array<u8> = array![];
    let mut i: u32 = 0;
    while i < 5 {
        ranks.append(card_to_rank(*cards.at(i)));
        suits.append(card_to_suit(*cards.at(i)));
        i += 1;
    };

    // Sort ranks descending (bubble sort on 5 elements)
    let sorted = sort_five_desc(ranks.span());

    // Count ranks
    let mut rank_counts: Array<u8> = array_of_13_zeros();
    let mut ci: u32 = 0;
    while ci < 5 {
        let r: u8 = *sorted.at(ci);
        let old = get_at(rank_counts.span(), r);
        rank_counts = set_at(rank_counts.span(), r, old + 1);
        ci += 1;
    };

    // Check flush
    let is_flush = (*suits.at(0) == *suits.at(1))
        && (*suits.at(1) == *suits.at(2))
        && (*suits.at(2) == *suits.at(3))
        && (*suits.at(3) == *suits.at(4));

    // Check straight
    let (is_straight, straight_high) = check_straight(sorted.span());

    // Determine hand rank
    if is_flush && is_straight {
        // Straight Flush (9)
        return (9, straight_high.into());
    }

    // Four of a Kind (8)
    let four_kind = find_count(rank_counts.span(), 4);
    if four_kind != 255 {
        let kicker = find_kicker_excluding(sorted.span(), four_kind);
        let tb = pack_tiebreaker(array![four_kind, kicker].span());
        return (8, tb);
    }

    // Full House (7)
    let three_kind = find_count(rank_counts.span(), 3);
    let pair = find_count(rank_counts.span(), 2);
    if three_kind != 255 && pair != 255 {
        let tb = pack_tiebreaker(array![three_kind, pair].span());
        return (7, tb);
    }

    if is_flush {
        // Flush (6) — tiebreaker is all 5 cards sorted desc
        let tb = pack_tiebreaker(sorted.span());
        return (6, tb);
    }

    if is_straight {
        // Straight (5)
        return (5, straight_high.into());
    }

    if three_kind != 255 {
        // Three of a Kind (4)
        let kickers = find_kickers_excluding_n(sorted.span(), three_kind, 2);
        let tb = pack_tiebreaker(
            array![three_kind, *kickers.at(0), *kickers.at(1)].span(),
        );
        return (4, tb);
    }

    // Two Pair (3)
    if pair != 255 {
        let pair2 = find_count_skip(rank_counts.span(), 2, pair);
        if pair2 != 255 {
            let high_pair = if pair > pair2 {
                pair
            } else {
                pair2
            };
            let low_pair = if pair > pair2 {
                pair2
            } else {
                pair
            };
            let kicker = find_kicker_excluding_two(sorted.span(), high_pair, low_pair);
            let tb = pack_tiebreaker(array![high_pair, low_pair, kicker].span());
            return (3, tb);
        }

        // One Pair (2)
        let kickers = find_kickers_excluding_n(sorted.span(), pair, 3);
        let tb = pack_tiebreaker(
            array![pair, *kickers.at(0), *kickers.at(1), *kickers.at(2)].span(),
        );
        return (2, tb);
    }

    // High Card (1)
    let tb = pack_tiebreaker(sorted.span());
    (1, tb)
}

// Sort 5 values in descending order
fn sort_five_desc(vals: Span<u8>) -> Array<u8> {
    let mut arr: Array<u8> = array![
        *vals.at(0), *vals.at(1), *vals.at(2), *vals.at(3), *vals.at(4),
    ];

    // Bubble sort passes (5 elements, 4 passes)
    let mut pass: u32 = 0;
    while pass < 4 {
        let mut i: u32 = 0;
        while i < 4 - pass {
            let a = get_at(arr.span(), i.try_into().unwrap());
            let b = get_at(arr.span(), (i + 1).try_into().unwrap());
            if a < b {
                arr = set_at(arr.span(), i.try_into().unwrap(), b);
                arr = set_at(arr.span(), (i + 1).try_into().unwrap(), a);
            }
            i += 1;
        };
        pass += 1;
    };

    arr
}

// Check if 5 sorted-descending ranks form a straight
// Returns (is_straight, high_card_rank)
fn check_straight(sorted: Span<u8>) -> (bool, u8) {
    let s0 = *sorted.at(0);
    let s1 = *sorted.at(1);
    let s2 = *sorted.at(2);
    let s3 = *sorted.at(3);
    let s4 = *sorted.at(4);

    // Normal straight: each card is 1 less than previous
    if s0 == s1 + 1 && s1 == s2 + 1 && s2 == s3 + 1 && s3 == s4 + 1 {
        return (true, s0);
    }

    // Wheel (A-2-3-4-5): sorted would be [12, 3, 2, 1, 0] (A, 5, 4, 3, 2)
    if s0 == 12 && s1 == 3 && s2 == 2 && s3 == 1 && s4 == 0 {
        return (true, 3); // 5-high straight (high card is 5 = rank 3)
    }

    (false, 0)
}

// Find the highest rank with exactly `count` occurrences
fn find_count(counts: Span<u8>, target: u8) -> u8 {
    let mut r: u8 = 12; // Start from Ace
    loop {
        if get_at(counts, r) == target {
            break r;
        }
        if r == 0 {
            break 255_u8; // Not found
        }
        r -= 1;
    }
}

// Find the highest rank with exactly `count` occurrences, skipping `skip_rank`
fn find_count_skip(counts: Span<u8>, target: u8, skip_rank: u8) -> u8 {
    let mut r: u8 = 12;
    loop {
        if r != skip_rank && get_at(counts, r) == target {
            break r;
        }
        if r == 0 {
            break 255_u8;
        }
        r -= 1;
    }
}

// Find highest kicker card not of rank `exclude_rank` from sorted hand
fn find_kicker_excluding(sorted: Span<u8>, exclude_rank: u8) -> u8 {
    let mut i: u32 = 0;
    loop {
        if i >= sorted.len() {
            break 0_u8;
        }
        if *sorted.at(i) != exclude_rank {
            break *sorted.at(i);
        }
        i += 1;
    }
}

// Find N kickers excluding a given rank
fn find_kickers_excluding_n(sorted: Span<u8>, exclude_rank: u8, n: u32) -> Array<u8> {
    let mut result: Array<u8> = array![];
    let mut i: u32 = 0;
    let mut found: u32 = 0;
    while i < sorted.len() && found < n {
        if *sorted.at(i) != exclude_rank {
            result.append(*sorted.at(i));
            found += 1;
        }
        i += 1;
    };
    result
}

// Find highest kicker excluding two ranks
fn find_kicker_excluding_two(sorted: Span<u8>, ex1: u8, ex2: u8) -> u8 {
    let mut i: u32 = 0;
    loop {
        if i >= sorted.len() {
            break 0_u8;
        }
        if *sorted.at(i) != ex1 && *sorted.at(i) != ex2 {
            break *sorted.at(i);
        }
        i += 1;
    }
}

// Pack up to 5 rank values into a u32 tiebreaker (most significant first)
fn pack_tiebreaker(values: Span<u8>) -> u32 {
    let mut result: u32 = 0;
    let mut i: u32 = 0;
    while i < values.len() {
        result = result * 16 + (*values.at(i)).into();
        i += 1;
    };
    result
}

// Helper: create array of 13 zeros
fn array_of_13_zeros() -> Array<u8> {
    array![0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}

// Helper: get element from span by u8 index
fn get_at(arr: Span<u8>, idx: u8) -> u8 {
    let i: u32 = idx.into();
    *arr.at(i)
}

// Helper: create new array with one element changed
fn set_at(arr: Span<u8>, idx: u8, val: u8) -> Array<u8> {
    let i_target: u32 = idx.into();
    let mut result: Array<u8> = array![];
    let mut i: u32 = 0;
    while i < arr.len() {
        if i == i_target {
            result.append(val);
        } else {
            result.append(*arr.at(i));
        }
        i += 1;
    };
    result
}

#[cfg(test)]
mod tests {
    use super::evaluate_best_hand;
    use crate::utils::card_mapping::rank_suit_to_card;

    // Helper to make a 7-card hand
    fn make_hand(c0: u8, c1: u8, c2: u8, c3: u8, c4: u8, c5: u8, c6: u8) -> Array<u8> {
        array![c0, c1, c2, c3, c4, c5, c6]
    }

    #[test]
    fn test_royal_flush() {
        // A-K-Q-J-10 of hearts (suit=2) + two junk cards
        let hand = make_hand(
            rank_suit_to_card(12, 2), // Ah
            rank_suit_to_card(11, 2), // Kh
            rank_suit_to_card(10, 2), // Qh
            rank_suit_to_card(9, 2),  // Jh
            rank_suit_to_card(8, 2),  // 10h
            rank_suit_to_card(0, 0),  // 2c (junk)
            rank_suit_to_card(1, 1),  // 3d (junk)
        );
        let (rank, _tb) = evaluate_best_hand(hand.span());
        assert(rank == 9, 'should be straight flush');
    }

    #[test]
    fn test_four_of_a_kind() {
        // Four Aces + three junk
        let hand = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(12, 1), // Ad
            rank_suit_to_card(12, 2), // Ah
            rank_suit_to_card(12, 3), // As
            rank_suit_to_card(11, 0), // Kc
            rank_suit_to_card(0, 0),  // 2c
            rank_suit_to_card(1, 1),  // 3d
        );
        let (rank, _tb) = evaluate_best_hand(hand.span());
        assert(rank == 8, 'should be four of a kind');
    }

    #[test]
    fn test_full_house() {
        // Three Kings + two Queens + two junk
        let hand = make_hand(
            rank_suit_to_card(11, 0), // Kc
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(11, 2), // Kh
            rank_suit_to_card(10, 0), // Qc
            rank_suit_to_card(10, 1), // Qd
            rank_suit_to_card(0, 0),  // 2c
            rank_suit_to_card(1, 1),  // 3d
        );
        let (rank, _tb) = evaluate_best_hand(hand.span());
        assert(rank == 7, 'should be full house');
    }

    #[test]
    fn test_flush() {
        // Five clubs (non-straight) + two junk
        let hand = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(10, 0), // Qc
            rank_suit_to_card(7, 0),  // 9c
            rank_suit_to_card(5, 0),  // 7c
            rank_suit_to_card(2, 0),  // 4c
            rank_suit_to_card(0, 1),  // 2d (junk)
            rank_suit_to_card(1, 2),  // 3h (junk)
        );
        let (rank, _tb) = evaluate_best_hand(hand.span());
        assert(rank == 6, 'should be flush');
    }

    #[test]
    fn test_straight() {
        // 9-8-7-6-5 mixed suits + two junk
        let hand = make_hand(
            rank_suit_to_card(7, 0),  // 9c
            rank_suit_to_card(6, 1),  // 8d
            rank_suit_to_card(5, 2),  // 7h
            rank_suit_to_card(4, 3),  // 6s
            rank_suit_to_card(3, 0),  // 5c
            rank_suit_to_card(0, 1),  // 2d (junk)
            rank_suit_to_card(1, 2),  // 3h (junk)
        );
        let (rank, _tb) = evaluate_best_hand(hand.span());
        assert(rank == 5, 'should be straight');
    }

    #[test]
    fn test_wheel_straight() {
        // A-2-3-4-5 (wheel) mixed suits + two junk
        let hand = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(0, 1),  // 2d
            rank_suit_to_card(1, 2),  // 3h
            rank_suit_to_card(2, 3),  // 4s
            rank_suit_to_card(3, 0),  // 5c
            rank_suit_to_card(8, 1),  // 10d (junk)
            rank_suit_to_card(9, 2),  // Jh (junk)
        );
        let (rank, tb) = evaluate_best_hand(hand.span());
        assert(rank == 5, 'should be straight (wheel)');
        assert(tb == 3, 'wheel high card is 5');
    }

    #[test]
    fn test_three_of_a_kind() {
        // Three 10s + kickers
        let hand = make_hand(
            rank_suit_to_card(8, 0),  // 10c
            rank_suit_to_card(8, 1),  // 10d
            rank_suit_to_card(8, 2),  // 10h
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(5, 1),  // 7d
            rank_suit_to_card(2, 2),  // 4h
            rank_suit_to_card(0, 3),  // 2s
        );
        let (rank, _tb) = evaluate_best_hand(hand.span());
        assert(rank == 4, 'should be three of a kind');
    }

    #[test]
    fn test_two_pair() {
        // Pair of Kings + pair of 5s + kickers
        let hand = make_hand(
            rank_suit_to_card(11, 0), // Kc
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(3, 0),  // 5c
            rank_suit_to_card(3, 1),  // 5d
            rank_suit_to_card(12, 2), // Ah
            rank_suit_to_card(0, 3),  // 2s
            rank_suit_to_card(1, 0),  // 3c
        );
        let (rank, _tb) = evaluate_best_hand(hand.span());
        assert(rank == 3, 'should be two pair');
    }

    #[test]
    fn test_one_pair() {
        // Pair of Jacks + kickers
        let hand = make_hand(
            rank_suit_to_card(9, 0),  // Jc
            rank_suit_to_card(9, 1),  // Jd
            rank_suit_to_card(12, 2), // Ah
            rank_suit_to_card(8, 3),  // 10s
            rank_suit_to_card(5, 0),  // 7c
            rank_suit_to_card(2, 1),  // 4d
            rank_suit_to_card(0, 2),  // 2h
        );
        let (rank, _tb) = evaluate_best_hand(hand.span());
        assert(rank == 2, 'should be one pair');
    }

    #[test]
    fn test_high_card() {
        // No pair, no flush, no straight
        let hand = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(10, 1), // Qd
            rank_suit_to_card(8, 2),  // 10h
            rank_suit_to_card(6, 3),  // 8s
            rank_suit_to_card(4, 0),  // 6c
            rank_suit_to_card(2, 1),  // 4d
            rank_suit_to_card(0, 2),  // 2h
        );
        let (rank, _tb) = evaluate_best_hand(hand.span());
        assert(rank == 1, 'should be high card');
    }

    #[test]
    fn test_tiebreaker_high_card() {
        // Two high-card hands, compare tiebreakers
        let hand1 = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(8, 2),  // 10h
            rank_suit_to_card(6, 3),  // 8s
            rank_suit_to_card(4, 0),  // 6c
            rank_suit_to_card(2, 1),  // 4d
            rank_suit_to_card(0, 2),  // 2h
        );
        let hand2 = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(8, 2),  // 10h
            rank_suit_to_card(6, 3),  // 8s
            rank_suit_to_card(3, 0),  // 5c (lower than 6c)
            rank_suit_to_card(2, 1),  // 4d
            rank_suit_to_card(0, 2),  // 2h
        );
        let (_r1, tb1) = evaluate_best_hand(hand1.span());
        let (_r2, tb2) = evaluate_best_hand(hand2.span());
        assert(tb1 > tb2, 'hand1 should have higher tb');
    }

    // ── Additional edge case tests ──

    #[test]
    fn test_straight_flush_low() {
        // 5-high straight flush (A-2-3-4-5 of spades)
        let hand = make_hand(
            rank_suit_to_card(12, 3), // As
            rank_suit_to_card(0, 3),  // 2s
            rank_suit_to_card(1, 3),  // 3s
            rank_suit_to_card(2, 3),  // 4s
            rank_suit_to_card(3, 3),  // 5s
            rank_suit_to_card(8, 0),  // 10c (junk)
            rank_suit_to_card(9, 1),  // Jd (junk)
        );
        let (rank, tb) = evaluate_best_hand(hand.span());
        assert(rank == 9, 'should be straight flush');
        assert(tb == 3, 'wheel SF high is 5');
    }

    #[test]
    fn test_split_pot_identical_hands() {
        // Two identical full houses (both pick KKK-QQ from community)
        // Hole cards are irrelevant lower cards
        // Community: Kc Kd Kh Qc Qd
        let hand1 = make_hand(
            rank_suit_to_card(11, 0), // Kc
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(11, 2), // Kh
            rank_suit_to_card(10, 0), // Qc
            rank_suit_to_card(10, 1), // Qd
            rank_suit_to_card(0, 0),  // 2c (hole 1)
            rank_suit_to_card(1, 0),  // 3c (hole 2)
        );
        let hand2 = make_hand(
            rank_suit_to_card(11, 0), // Kc
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(11, 2), // Kh
            rank_suit_to_card(10, 0), // Qc
            rank_suit_to_card(10, 1), // Qd
            rank_suit_to_card(4, 1),  // 6d (hole 1)
            rank_suit_to_card(5, 2),  // 7h (hole 2)
        );
        let (r1, tb1) = evaluate_best_hand(hand1.span());
        let (r2, tb2) = evaluate_best_hand(hand2.span());
        assert(r1 == r2, 'same rank');
        assert(tb1 == tb2, 'same tiebreaker = split');
    }

    #[test]
    fn test_kicker_decides_pair() {
        // Both have pair of aces, different kickers
        let hand1 = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(12, 1), // Ad
            rank_suit_to_card(11, 2), // Kh (kicker)
            rank_suit_to_card(8, 3),  // 10s
            rank_suit_to_card(5, 0),  // 7c
            rank_suit_to_card(2, 1),  // 4d
            rank_suit_to_card(0, 2),  // 2h
        );
        let hand2 = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(12, 1), // Ad
            rank_suit_to_card(10, 2), // Qh (kicker, lower than K)
            rank_suit_to_card(8, 3),  // 10s
            rank_suit_to_card(5, 0),  // 7c
            rank_suit_to_card(2, 1),  // 4d
            rank_suit_to_card(0, 2),  // 2h
        );
        let (r1, tb1) = evaluate_best_hand(hand1.span());
        let (r2, tb2) = evaluate_best_hand(hand2.span());
        assert(r1 == 2, 'hand1 one pair');
        assert(r2 == 2, 'hand2 one pair');
        assert(tb1 > tb2, 'king kicker beats queen');
    }

    #[test]
    fn test_full_house_trips_rank_priority() {
        // Full house KKK-QQ vs QQQ-KK — KKK wins
        let hand1 = make_hand(
            rank_suit_to_card(11, 0), // Kc
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(11, 2), // Kh
            rank_suit_to_card(10, 0), // Qc
            rank_suit_to_card(10, 1), // Qd
            rank_suit_to_card(0, 0),  // 2c
            rank_suit_to_card(1, 1),  // 3d
        );
        let hand2 = make_hand(
            rank_suit_to_card(10, 0), // Qc
            rank_suit_to_card(10, 1), // Qd
            rank_suit_to_card(10, 2), // Qh
            rank_suit_to_card(11, 0), // Kc
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(0, 0),  // 2c
            rank_suit_to_card(1, 1),  // 3d
        );
        let (r1, tb1) = evaluate_best_hand(hand1.span());
        let (r2, tb2) = evaluate_best_hand(hand2.span());
        assert(r1 == 7, 'hand1 full house');
        assert(r2 == 7, 'hand2 full house');
        assert(tb1 > tb2, 'KKK-QQ beats QQQ-KK');
    }

    #[test]
    fn test_broadway_straight() {
        // A-K-Q-J-10 mixed suits (broadway straight, not flush)
        let hand = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(10, 2), // Qh
            rank_suit_to_card(9, 3),  // Js
            rank_suit_to_card(8, 0),  // 10c
            rank_suit_to_card(5, 1),  // 7d (junk)
            rank_suit_to_card(2, 2),  // 4h (junk)
        );
        let (rank, tb) = evaluate_best_hand(hand.span());
        assert(rank == 5, 'should be straight');
        assert(tb == 12, 'ace-high straight');
    }

    #[test]
    fn test_flush_beats_straight() {
        // Flush should beat a straight
        let flush_hand = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(10, 0), // Qc
            rank_suit_to_card(7, 0),  // 9c
            rank_suit_to_card(5, 0),  // 7c
            rank_suit_to_card(2, 0),  // 4c
            rank_suit_to_card(0, 1),  // 2d (junk)
            rank_suit_to_card(1, 2),  // 3h (junk)
        );
        let straight_hand = make_hand(
            rank_suit_to_card(8, 0),  // 10c
            rank_suit_to_card(7, 1),  // 9d
            rank_suit_to_card(6, 2),  // 8h
            rank_suit_to_card(5, 3),  // 7s
            rank_suit_to_card(4, 0),  // 6c
            rank_suit_to_card(0, 1),  // 2d (junk)
            rank_suit_to_card(1, 2),  // 3h (junk)
        );
        let (r_flush, _) = evaluate_best_hand(flush_hand.span());
        let (r_straight, _) = evaluate_best_hand(straight_hand.span());
        assert(r_flush > r_straight, 'flush beats straight');
    }

    #[test]
    fn test_four_of_kind_kicker() {
        // Both have four 8s, different kickers
        let hand1 = make_hand(
            rank_suit_to_card(6, 0), // 8c
            rank_suit_to_card(6, 1), // 8d
            rank_suit_to_card(6, 2), // 8h
            rank_suit_to_card(6, 3), // 8s
            rank_suit_to_card(12, 0), // Ac (kicker)
            rank_suit_to_card(0, 1),  // 2d
            rank_suit_to_card(1, 2),  // 3h
        );
        let hand2 = make_hand(
            rank_suit_to_card(6, 0), // 8c
            rank_suit_to_card(6, 1), // 8d
            rank_suit_to_card(6, 2), // 8h
            rank_suit_to_card(6, 3), // 8s
            rank_suit_to_card(11, 0), // Kc (kicker)
            rank_suit_to_card(0, 1),  // 2d
            rank_suit_to_card(1, 2),  // 3h
        );
        let (r1, tb1) = evaluate_best_hand(hand1.span());
        let (r2, tb2) = evaluate_best_hand(hand2.span());
        assert(r1 == 8, 'four of a kind');
        assert(r2 == 8, 'four of a kind');
        assert(tb1 > tb2, 'ace kicker beats king');
    }

    #[test]
    fn test_two_pair_kicker() {
        // Both have AA-KK, different fifth card
        let hand1 = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(12, 1), // Ad
            rank_suit_to_card(11, 0), // Kc
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(10, 2), // Qh (kicker)
            rank_suit_to_card(0, 3),  // 2s
            rank_suit_to_card(1, 0),  // 3c
        );
        let hand2 = make_hand(
            rank_suit_to_card(12, 0), // Ac
            rank_suit_to_card(12, 1), // Ad
            rank_suit_to_card(11, 0), // Kc
            rank_suit_to_card(11, 1), // Kd
            rank_suit_to_card(9, 2),  // Jh (kicker)
            rank_suit_to_card(0, 3),  // 2s
            rank_suit_to_card(1, 0),  // 3c
        );
        let (r1, tb1) = evaluate_best_hand(hand1.span());
        let (r2, tb2) = evaluate_best_hand(hand2.span());
        assert(r1 == 3, 'two pair');
        assert(r2 == 3, 'two pair');
        assert(tb1 > tb2, 'queen kicker beats jack');
    }
}
