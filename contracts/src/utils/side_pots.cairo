use dojo::model::ModelStorage;
use crate::models::hand::PlayerHand;
use crate::models::card::SidePot;

/// Check if any non-folded player in the hand is all-in.
pub fn check_any_all_in(
    ref world: dojo::world::WorldStorage, hand_id: u64, max_players: u8,
) -> bool {
    let mut i: u8 = 0;
    while i < max_players {
        let ph: PlayerHand = world.read_model((hand_id, i));
        if ph.player != 0.try_into().unwrap() && !ph.has_folded && ph.is_all_in {
            return true;
        }
        i += 1;
    };
    false
}

/// Standard poker side-pot algorithm.
///
/// F-04 FIX: Thresholds are built from ALL contributors (including folded),
/// because folded players' chips are already in the pot. Only the eligible_mask
/// (who can WIN) excludes folded players.
pub fn create_side_pots(
    ref world: dojo::world::WorldStorage, hand_id: u64, max_players: u8,
) {
    let mut all_bets: Array<u128> = array![];
    let mut all_seats: Array<u8> = array![];
    let mut all_folded: Array<bool> = array![];

    let mut i: u8 = 0;
    while i < max_players {
        let ph: PlayerHand = world.read_model((hand_id, i));
        if ph.player != 0.try_into().unwrap() && ph.total_bet > 0 {
            all_bets.append(ph.total_bet);
            all_seats.append(i);
            all_folded.append(ph.has_folded);
        }
        i += 1;
    };

    let n = all_bets.len();
    if n == 0 {
        return;
    }

    // Collect unique thresholds from ALL contributors
    let mut thresholds: Array<u128> = array![];
    let mut ti: u32 = 0;
    while ti < n {
        let b = *all_bets.at(ti);
        let mut found = false;
        let mut tj: u32 = 0;
        while tj < thresholds.len() {
            if *thresholds.at(tj) == b {
                found = true;
                break;
            }
            tj += 1;
        };
        if !found && b > 0 {
            thresholds.append(b);
        }
        ti += 1;
    };

    let tlen = thresholds.len();
    if tlen <= 1 {
        return;
    }

    // Selection sort ascending (max 6 elements)
    let mut sorted: Array<u128> = array![];
    let mut remaining: Array<u128> = array![];
    let mut ci: u32 = 0;
    while ci < tlen {
        remaining.append(*thresholds.at(ci));
        ci += 1;
    };

    let sort_len = remaining.len();
    let mut si: u32 = 0;
    while si < sort_len {
        let mut min_val: u128 = 0xffffffffffffffffffffffffffffffff;
        let mut min_idx: u32 = 0;
        let mut sj: u32 = 0;
        while sj < remaining.len() {
            if *remaining.at(sj) < min_val {
                min_val = *remaining.at(sj);
                min_idx = sj;
            }
            sj += 1;
        };

        sorted.append(min_val);

        let mut new_remaining: Array<u128> = array![];
        let mut sk: u32 = 0;
        while sk < remaining.len() {
            if sk != min_idx {
                new_remaining.append(*remaining.at(sk));
            }
            sk += 1;
        };
        remaining = new_remaining;
        si += 1;
    };

    // Build side pots from sorted thresholds.
    // pot_amount includes ALL contributors (folded + live).
    // eligible_mask only includes non-folded players.
    let mut prev_threshold: u128 = 0;
    let mut pot_index: u8 = 0;

    let mut pi: u32 = 0;
    while pi < sorted.len() {
        let threshold = *sorted.at(pi);
        let level_amount = threshold - prev_threshold;

        if level_amount > 0 {
            let mut contributor_count: u128 = 0;
            let mut eligible_mask: u8 = 0;
            let mut ej: u32 = 0;
            while ej < n {
                if *all_bets.at(ej) >= threshold {
                    contributor_count += 1;
                    if !*all_folded.at(ej) {
                        let seat = *all_seats.at(ej);
                        eligible_mask = eligible_mask | shl_u8(1, seat);
                    }
                }
                ej += 1;
            };

            let pot_amount = level_amount * contributor_count;

            // S-02 FIX: If all contributors at this tier folded, the pot is
            // "dead money". Make all non-folded players eligible so it goes
            // to the best remaining hand rather than being silently lost.
            if eligible_mask == 0 {
                let mut dk: u32 = 0;
                while dk < n {
                    if !*all_folded.at(dk) {
                        let seat = *all_seats.at(dk);
                        eligible_mask = eligible_mask | shl_u8(1, seat);
                    }
                    dk += 1;
                };
            }

            // Only write the pot if someone can win it
            if eligible_mask != 0 {
                let side_pot = SidePot {
                    hand_id,
                    pot_index,
                    amount: pot_amount,
                    eligible_mask,
                };
                world.write_model(@side_pot);
                pot_index += 1;
            }
        }

        prev_threshold = threshold;
        pi += 1;
    };
}

pub fn shl_u8(val: u8, shift: u8) -> u8 {
    if shift == 0 { return val; }
    if shift == 1 { return val * 2; }
    if shift == 2 { return val * 4; }
    if shift == 3 { return val * 8; }
    if shift == 4 { return val * 16; }
    if shift == 5 { return val * 32; }
    if shift == 6 { return val * 64; }
    assert(false, 'shl_u8: shift out of range');
    0
}

#[cfg(test)]
mod tests {
    use super::shl_u8;

    #[test]
    fn test_shl_u8_all_shifts() {
        assert(shl_u8(1, 0) == 1, 'shift 0');
        assert(shl_u8(1, 1) == 2, 'shift 1');
        assert(shl_u8(1, 2) == 4, 'shift 2');
        assert(shl_u8(1, 3) == 8, 'shift 3');
        assert(shl_u8(1, 4) == 16, 'shift 4');
        assert(shl_u8(1, 5) == 32, 'shift 5');
        assert(shl_u8(1, 6) == 64, 'shift 6');
    }

    #[test]
    fn test_shl_u8_bitmask() {
        // Build eligible mask for seats 0, 2, 5
        let mask = shl_u8(1, 0) | shl_u8(1, 2) | shl_u8(1, 5);
        assert(mask == 37, 'mask=1+4+32=37'); // 0b100101
    }

    #[test]
    #[should_panic(expected: 'shl_u8: shift out of range')]
    fn test_shl_u8_overflow() {
        shl_u8(1, 7);
    }
}
