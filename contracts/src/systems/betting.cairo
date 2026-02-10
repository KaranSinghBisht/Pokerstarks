use crate::models::enums::PlayerAction;

#[starknet::interface]
pub trait IBetting<T> {
    fn player_action(ref self: T, hand_id: u64, action: PlayerAction, amount: u128);
}

#[dojo::contract]
pub mod betting_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp};
    use super::IBetting;
    use crate::models::hand::{Hand, PlayerHand};
    use crate::models::table::{Table, Seat};
    use crate::models::card::SidePot;
    use crate::models::enums::{GamePhase, PlayerAction};

    const ZERO_ADDR: felt252 = 0;

    #[abi(embed_v0)]
    impl BettingImpl of IBetting<ContractState> {
        fn player_action(
            ref self: ContractState, hand_id: u64, action: PlayerAction, amount: u128,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut hand: Hand = world.read_model(hand_id);

            // Verify we're in a betting phase
            assert(
                hand.phase == GamePhase::BettingPreflop
                    || hand.phase == GamePhase::BettingFlop
                    || hand.phase == GamePhase::BettingTurn
                    || hand.phase == GamePhase::BettingRiver,
                'not betting phase',
            );

            // Verify it's caller's turn
            let table: Table = world.read_model(hand.table_id);
            let seat: Seat = world.read_model((hand.table_id, hand.current_turn_seat));
            assert(seat.player == caller, 'not your turn');

            let mut ph: PlayerHand = world.read_model((hand_id, hand.current_turn_seat));
            assert(!ph.has_folded, 'already folded');

            match action {
                PlayerAction::Fold => {
                    ph.has_folded = true;
                    hand.active_players -= 1;
                },
                PlayerAction::Check => {
                    assert(hand.current_bet == ph.bet_this_round, 'cannot check');
                },
                PlayerAction::Call => {
                    let call_amount = hand.current_bet - ph.bet_this_round;
                    assert(call_amount > 0, 'nothing to call');
                    ph.bet_this_round += call_amount;
                    ph.total_bet += call_amount;
                    hand.pot += call_amount;

                    let mut player_seat: Seat = world
                        .read_model((hand.table_id, hand.current_turn_seat));
                    assert(player_seat.chips >= call_amount, 'not enough chips');
                    player_seat.chips -= call_amount;
                    world.write_model(@player_seat);
                },
                PlayerAction::Bet => {
                    assert(hand.current_bet == 0, 'use raise instead');
                    assert(amount >= table.big_blind, 'bet below minimum');
                    ph.bet_this_round = amount;
                    ph.total_bet += amount;
                    hand.current_bet = amount;
                    hand.pot += amount;

                    let mut player_seat: Seat = world
                        .read_model((hand.table_id, hand.current_turn_seat));
                    assert(player_seat.chips >= amount, 'not enough chips');
                    player_seat.chips -= amount;
                    world.write_model(@player_seat);

                    // Reset has_acted for other players since there's a new bet
                    let mut k: u8 = 0;
                    while k < table.max_players {
                        if k != hand.current_turn_seat {
                            let mut other_ph: PlayerHand = world.read_model((hand_id, k));
                            if other_ph.player != ZERO_ADDR.try_into().unwrap()
                                && !other_ph.has_folded
                                && !other_ph.is_all_in {
                                other_ph.has_acted = false;
                                world.write_model(@other_ph);
                            }
                        }
                        k += 1;
                    };
                },
                PlayerAction::Raise => {
                    // Minimum raise: at least current_bet + big_blind
                    assert(amount >= hand.current_bet + table.big_blind, 'raise below minimum');
                    let raise_amount = amount - ph.bet_this_round;
                    ph.bet_this_round = amount;
                    ph.total_bet += raise_amount;
                    hand.current_bet = amount;
                    hand.pot += raise_amount;

                    let mut player_seat: Seat = world
                        .read_model((hand.table_id, hand.current_turn_seat));
                    assert(player_seat.chips >= raise_amount, 'not enough chips');
                    player_seat.chips -= raise_amount;
                    world.write_model(@player_seat);

                    // Reset has_acted for other players
                    let mut k: u8 = 0;
                    while k < table.max_players {
                        if k != hand.current_turn_seat {
                            let mut other_ph: PlayerHand = world.read_model((hand_id, k));
                            if other_ph.player != ZERO_ADDR.try_into().unwrap()
                                && !other_ph.has_folded
                                && !other_ph.is_all_in {
                                other_ph.has_acted = false;
                                world.write_model(@other_ph);
                            }
                        }
                        k += 1;
                    };
                },
                PlayerAction::AllIn => {
                    let mut player_seat: Seat = world
                        .read_model((hand.table_id, hand.current_turn_seat));
                    let all_in_amount = player_seat.chips;
                    let total_bet = ph.bet_this_round + all_in_amount;

                    // If this all-in raises above current bet, reset has_acted for others
                    if total_bet > hand.current_bet {
                        hand.current_bet = total_bet;
                        // Reset has_acted for other active players since bet changed
                        let mut k: u8 = 0;
                        while k < table.max_players {
                            if k != hand.current_turn_seat {
                                let mut other_ph: PlayerHand = world
                                    .read_model((hand_id, k));
                                if other_ph.player != ZERO_ADDR.try_into().unwrap()
                                    && !other_ph.has_folded
                                    && !other_ph.is_all_in {
                                    other_ph.has_acted = false;
                                    world.write_model(@other_ph);
                                }
                            }
                            k += 1;
                        };
                    }

                    ph.bet_this_round = total_bet;
                    ph.total_bet += all_in_amount;
                    ph.is_all_in = true;
                    hand.pot += all_in_amount;

                    player_seat.chips = 0;
                    world.write_model(@player_seat);
                },
            }

            ph.has_acted = true;
            world.write_model(@ph);

            // Find next active seat
            let max = table.max_players;
            let current = hand.current_turn_seat;
            let mut next_seat = (current + 1) % max;
            let mut attempts: u8 = 0;
            while attempts < max {
                let s: Seat = world.read_model((table.table_id, next_seat));
                if s.is_occupied {
                    let next_ph: PlayerHand = world.read_model((hand_id, next_seat));
                    if !next_ph.has_folded && !next_ph.is_all_in {
                        break;
                    }
                }
                next_seat = (next_seat + 1) % max;
                attempts += 1;
            };

            // Check if round is complete
            let mut round_complete = true;
            let mut rc_i: u8 = 0;
            while rc_i < table.max_players {
                let s: Seat = world.read_model((table.table_id, rc_i));
                if s.is_occupied {
                    let rph: PlayerHand = world.read_model((hand_id, rc_i));
                    if rph.player != ZERO_ADDR.try_into().unwrap()
                        && !rph.has_folded
                        && !rph.is_all_in {
                        if !rph.has_acted || rph.bet_this_round != hand.current_bet {
                            round_complete = false;
                            break;
                        }
                    }
                }
                rc_i += 1;
            };

            if hand.active_players <= 1 {
                // A-07 FIX: Create side pots before transitioning to settling
                // (so timeout/settle can distribute correctly if only 1 player remains)
                let has_all_in = check_any_all_in(ref world, hand_id, table.max_players);
                if has_all_in {
                    create_side_pots(ref world, hand_id, table.max_players);
                }
                hand.phase = GamePhase::Settling;
            } else if round_complete {
                // A-07 FIX: Create side pots at the end of the final betting round
                // (BettingRiver → Showdown) or whenever any player is all-in
                let next_phase = match hand.phase {
                    GamePhase::BettingPreflop => GamePhase::DealingFlop,
                    GamePhase::BettingFlop => GamePhase::DealingTurn,
                    GamePhase::BettingTurn => GamePhase::DealingRiver,
                    GamePhase::BettingRiver => GamePhase::Showdown,
                    _ => hand.phase,
                };

                // Create side pots at the end of the last betting round or if anyone is all-in
                if next_phase == GamePhase::Showdown {
                    let has_all_in = check_any_all_in(ref world, hand_id, table.max_players);
                    if has_all_in {
                        create_side_pots(ref world, hand_id, table.max_players);
                    }
                }

                hand.phase = next_phase;
                hand.current_bet = 0;
                // Reset bet_this_round and has_acted
                let mut ri: u8 = 0;
                while ri < table.max_players {
                    let s: Seat = world.read_model((table.table_id, ri));
                    if s.is_occupied {
                        let mut rph: PlayerHand = world.read_model((hand_id, ri));
                        if rph.player != ZERO_ADDR.try_into().unwrap() {
                            rph.has_acted = false;
                            rph.bet_this_round = 0;
                            world.write_model(@rph);
                        }
                    }
                    ri += 1;
                };
            } else {
                hand.current_turn_seat = next_seat;
                hand.phase_deadline = get_block_timestamp() + 45;
            }

            world.write_model(@hand);
        }
    }

    /// Check if any player in the hand is all-in.
    fn check_any_all_in(
        ref world: dojo::world::WorldStorage, hand_id: u64, max_players: u8,
    ) -> bool {
        let mut i: u8 = 0;
        while i < max_players {
            let ph: PlayerHand = world.read_model((hand_id, i));
            if ph.player != ZERO_ADDR.try_into().unwrap() && !ph.has_folded && ph.is_all_in {
                return true;
            }
            i += 1;
        };
        false
    }

    /// A-07 FIX: Create side pots based on all-in amounts.
    /// Uses the standard poker algorithm:
    /// 1. Collect all non-folded players' total_bet amounts
    /// 2. Sort unique thresholds ascending
    /// 3. For each threshold: pot = (threshold - prev_threshold) × eligible_count
    /// 4. eligible_mask = bitmask of players who contributed at or above this threshold
    fn create_side_pots(
        ref world: dojo::world::WorldStorage, hand_id: u64, max_players: u8,
    ) {
        // Collect (total_bet, seat_index) for all non-folded players
        // Using fixed-size arrays since max_players <= 6
        let mut bets: Array<u128> = array![];
        let mut bet_seats: Array<u8> = array![];

        let mut i: u8 = 0;
        while i < max_players {
            let ph: PlayerHand = world.read_model((hand_id, i));
            if ph.player != ZERO_ADDR.try_into().unwrap() && !ph.has_folded {
                bets.append(ph.total_bet);
                bet_seats.append(i);
            }
            i += 1;
        };

        let n = bets.len();
        if n == 0 {
            return;
        }

        // Collect unique sorted thresholds (insertion sort since n <= 6)
        let mut thresholds: Array<u128> = array![];
        let mut ti: u32 = 0;
        while ti < n {
            let b = *bets.at(ti);
            // Insert into sorted thresholds if not already present
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

        // Sort thresholds ascending (bubble sort, max 6 elements)
        let tlen = thresholds.len();
        if tlen <= 1 {
            // Only one threshold means no side pots needed (all bet the same)
            return;
        }

        // Copy thresholds into a sortable structure
        // Since Cairo doesn't have mutable array indexing, rebuild sorted
        let mut sorted: Array<u128> = array![];
        let mut remaining: Array<u128> = array![];
        let mut ci: u32 = 0;
        while ci < tlen {
            remaining.append(*thresholds.at(ci));
            ci += 1;
        };

        // Selection sort: repeatedly find minimum
        let sort_len = remaining.len();
        let mut si: u32 = 0;
        while si < sort_len {
            // Find minimum in remaining
            let mut min_val: u128 = 0xffffffffffffffffffffffffffffffff; // u128 max
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

            // Rebuild remaining without min_idx
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

        // Create side pots from sorted thresholds
        let mut prev_threshold: u128 = 0;
        let mut pot_index: u8 = 0;

        let mut pi: u32 = 0;
        while pi < sorted.len() {
            let threshold = *sorted.at(pi);
            let level_amount = threshold - prev_threshold;

            if level_amount > 0 {
                // Count how many players contributed at or above this threshold
                let mut eligible_count: u128 = 0;
                let mut eligible_mask: u8 = 0;
                let mut ej: u32 = 0;
                while ej < n {
                    if *bets.at(ej) >= threshold {
                        eligible_count += 1;
                        let seat = *bet_seats.at(ej);
                        // Set bit for this seat in the mask
                        eligible_mask = eligible_mask | shl_u8(1, seat);
                    }
                    ej += 1;
                };

                let pot_amount = level_amount * eligible_count;

                let side_pot = SidePot {
                    hand_id,
                    pot_index,
                    amount: pot_amount,
                    eligible_mask,
                };
                world.write_model(@side_pot);
                pot_index += 1;
            }

            prev_threshold = threshold;
            pi += 1;
        };
    }

    /// Bit shift left for u8 (1 << n)
    fn shl_u8(val: u8, shift: u8) -> u8 {
        if shift == 0 { return val; }
        if shift == 1 { return val * 2; }
        if shift == 2 { return val * 4; }
        if shift == 3 { return val * 8; }
        if shift == 4 { return val * 16; }
        if shift == 5 { return val * 32; }
        0 // shift >= 6 would overflow u8 for val=1
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
