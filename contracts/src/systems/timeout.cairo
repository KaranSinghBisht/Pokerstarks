#[starknet::interface]
pub trait ITimeout<T> {
    fn enforce_timeout(ref self: T, hand_id: u64);
}

#[dojo::contract]
pub mod timeout_system {
    use dojo::model::ModelStorage;
    use starknet::get_block_timestamp;
    use super::ITimeout;
    use crate::models::hand::{Hand, PlayerHand};
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;
    use crate::models::card::CommunityCards;
    use crate::utils::constants::CARD_NOT_DEALT;
    use crate::utils::side_pots::{create_side_pots, check_any_all_in};

    #[abi(embed_v0)]
    impl TimeoutImpl of ITimeout<ContractState> {
        fn enforce_timeout(ref self: ContractState, hand_id: u64) {
            let mut world = self.world_default();

            let mut hand: Hand = world.read_model(hand_id);
            assert(get_block_timestamp() > hand.phase_deadline, 'not timed out yet');

            let table: Table = world.read_model(hand.table_id);
            let max = table.max_players;

            match hand.phase {
                GamePhase::Setup => {
                    // Setup timeout: abort the hand, return blinds, go to Settling
                    // Players who posted blinds get them back
                    let mut i: u8 = 0;
                    while i < max {
                        let ph: PlayerHand = world.read_model((hand_id, i));
                        if ph.player != 0.try_into().unwrap() && ph.total_bet > 0 {
                            let mut seat: Seat = world.read_model((hand.table_id, i));
                            seat.chips += ph.total_bet;
                            world.write_model(@seat);
                        }
                        i += 1;
                    };
                    hand.pot = 0;
                    hand.phase = GamePhase::Settling;
                },
                GamePhase::Shuffling => {
                    // Find the player who should be shuffling (nth occupied seat)
                    let timed_out_seat = find_nth_occupied_seat(
                        ref world, hand.table_id, hand.shuffle_progress, max,
                    );

                    if timed_out_seat != 255 {
                        // Fold the timed-out shuffler
                        let mut ph: PlayerHand = world.read_model((hand_id, timed_out_seat));
                        if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                            ph.has_folded = true;
                            world.write_model(@ph);
                            hand.active_players -= 1;
                        }

                        // Mark their seat as sitting out
                        let mut seat: Seat = world.read_model((hand.table_id, timed_out_seat));
                        seat.is_sitting_out = true;
                        world.write_model(@seat);
                    }

                    if hand.active_players <= 1 {
                        // Not enough players to continue, abort hand
                        hand.phase = GamePhase::Settling;
                    } else {
                        // A-04 FIX: Copy the previous deck version as an identity shuffle
                        // so the deck version chain remains contiguous (0, 1, ..., num_players).
                        // Without this, dealing reads a non-existent deck version and crashes.
                        use crate::models::deck::EncryptedDeck;
                        let prev_deck: EncryptedDeck = world
                            .read_model((hand_id, hand.shuffle_progress));
                        let identity_deck = EncryptedDeck {
                            hand_id,
                            version: hand.shuffle_progress + 1,
                            cards: prev_deck.cards,
                        };
                        world.write_model(@identity_deck);

                        hand.shuffle_progress += 1;

                        // Recount how many active (non-folded) players remain
                        let mut active_count: u8 = 0;
                        let mut j: u8 = 0;
                        while j < max {
                            let ph: PlayerHand = world.read_model((hand_id, j));
                            if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                                active_count += 1;
                            }
                            j += 1;
                        };

                        if hand.shuffle_progress >= hand.num_players {
                            hand.phase = GamePhase::DealingPreflop;
                            hand.phase_deadline = get_block_timestamp() + 30;
                        } else {
                            hand.phase_deadline = get_block_timestamp() + 60;
                        }
                    }
                },
                GamePhase::DealingPreflop
                | GamePhase::DealingFlop
                | GamePhase::DealingTurn
                | GamePhase::DealingRiver => {
                    // A-05 FIX: In n-of-n aggregate-key ElGamal, if ANY player fails
                    // to submit reveal tokens, the remaining players cannot decrypt.
                    // The only correct action is to abort the hand.
                    // Mark timed-out players as sitting out for future hands.
                    let mut i: u8 = 0;
                    while i < max {
                        let ph: PlayerHand = world.read_model((hand_id, i));
                        if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                            if !has_submitted_all_required_tokens(
                                ref world, hand_id, i, hand.phase, max,
                            ) {
                                let mut seat: Seat = world.read_model((hand.table_id, i));
                                seat.is_sitting_out = true;
                                world.write_model(@seat);
                            }
                        }
                        i += 1;
                    };

                    hand.phase = GamePhase::Settling;
                },
                GamePhase::BettingPreflop
                | GamePhase::BettingFlop
                | GamePhase::BettingTurn
                | GamePhase::BettingRiver => {
                    // Auto-fold the timed-out player
                    let mut ph: PlayerHand = world
                        .read_model((hand_id, hand.current_turn_seat));
                    ph.has_folded = true;
                    ph.has_acted = true;
                    world.write_model(@ph);

                    hand.active_players -= 1;

                    if hand.active_players <= 1 {
                        hand.phase = GamePhase::Settling;
                    } else {
                        // Advance to next active player
                        let mut next = (hand.current_turn_seat + 1) % max;
                        let mut attempts: u8 = 0;
                        while attempts < max {
                            let next_ph: PlayerHand = world.read_model((hand_id, next));
                            if next_ph.player != 0.try_into().unwrap()
                                && !next_ph.has_folded
                                && !next_ph.is_all_in {
                                break;
                            }
                            next = (next + 1) % max;
                            attempts += 1;
                        };

                        // Check if round is now complete
                        let mut round_complete = true;
                        let mut rc: u8 = 0;
                        while rc < max {
                            let rph: PlayerHand = world.read_model((hand_id, rc));
                            if rph.player != 0.try_into().unwrap()
                                && !rph.has_folded
                                && !rph.is_all_in {
                                if !rph.has_acted
                                    || rph.bet_this_round != hand.current_bet {
                                    round_complete = false;
                                    break;
                                }
                            }
                            rc += 1;
                        };

                        if round_complete {
                            let next_phase =
                                match hand.phase {
                                    GamePhase::BettingPreflop => GamePhase::DealingFlop,
                                    GamePhase::BettingFlop => GamePhase::DealingTurn,
                                    GamePhase::BettingTurn => GamePhase::DealingRiver,
                                    GamePhase::BettingRiver => GamePhase::Showdown,
                                    _ => hand.phase,
                                };
                            // F-05 FIX: create side pots before entering Showdown
                            if next_phase == GamePhase::Showdown {
                                let has_all_in = check_any_all_in(
                                    ref world, hand_id, max,
                                );
                                if has_all_in {
                                    create_side_pots(ref world, hand_id, max);
                                }
                            }
                            hand.phase = next_phase;
                            hand.current_bet = 0;
                            let mut ri: u8 = 0;
                            while ri < max {
                                let mut rph: PlayerHand = world.read_model((hand_id, ri));
                                if rph.player != 0.try_into().unwrap() {
                                    rph.has_acted = false;
                                    rph.bet_this_round = 0;
                                    world.write_model(@rph);
                                }
                                ri += 1;
                            };
                        } else {
                            hand.current_turn_seat = next;
                            hand.phase_deadline = get_block_timestamp() + 45;
                        }
                    }
                },
                GamePhase::Showdown => {
                    // If community cards are unresolved (disagreement or
                    // missing), the hand can't proceed — abort to Settling.
                    let comm: CommunityCards = world.read_model(hand_id);
                    let community_resolved =
                        comm.flop_1 != CARD_NOT_DEALT
                        && comm.flop_2 != CARD_NOT_DEALT
                        && comm.flop_3 != CARD_NOT_DEALT
                        && comm.turn != CARD_NOT_DEALT
                        && comm.river != CARD_NOT_DEALT;

                    if !community_resolved {
                        hand.phase = GamePhase::Settling;
                    } else {
                        // Fold players whose hole cards aren't revealed
                        let mut i: u8 = 0;
                        while i < max {
                            let ph: PlayerHand = world.read_model((hand_id, i));
                            if ph.player != 0.try_into().unwrap()
                                && !ph.has_folded
                                && (ph.hole_card_1_id == CARD_NOT_DEALT
                                    || ph.hole_card_2_id == CARD_NOT_DEALT) {
                                let mut fold_ph: PlayerHand = world
                                    .read_model((hand_id, i));
                                fold_ph.has_folded = true;
                                world.write_model(@fold_ph);
                                hand.active_players -= 1;
                            }
                            i += 1;
                        };

                        if hand.active_players <= 1 {
                            hand.phase = GamePhase::Settling;
                        } else {
                            hand.phase_deadline = get_block_timestamp() + 30;
                        }
                    }
                },
                GamePhase::Settling => {
                    // F-02 FIX: proportional refund instead of first-seat-wins
                    if hand.pot > 0 {
                        let mut non_folded_count: u8 = 0;
                        let mut total_nf_bet: u128 = 0;
                        let mut ci: u8 = 0;
                        while ci < max {
                            let ph: PlayerHand = world.read_model((hand_id, ci));
                            if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                                non_folded_count += 1;
                                total_nf_bet += ph.total_bet;
                            }
                            ci += 1;
                        };

                        if non_folded_count == 1 {
                            let mut i: u8 = 0;
                            while i < max {
                                let ph: PlayerHand = world.read_model((hand_id, i));
                                if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                                    let mut seat: Seat = world
                                        .read_model((hand.table_id, i));
                                    seat.chips += hand.pot;
                                    world.write_model(@seat);
                                    break;
                                }
                                i += 1;
                            };
                        } else if non_folded_count > 1 && total_nf_bet > 0 {
                            let pot = hand.pot;
                            let mut distributed: u128 = 0;
                            let mut first_idx: u8 = 255;
                            let mut di: u8 = 0;
                            while di < max {
                                let ph: PlayerHand = world.read_model((hand_id, di));
                                if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                                    if first_idx == 255 { first_idx = di; }
                                    let share = pot * ph.total_bet / total_nf_bet;
                                    let mut seat: Seat = world
                                        .read_model((hand.table_id, di));
                                    seat.chips += share;
                                    world.write_model(@seat);
                                    distributed += share;
                                }
                                di += 1;
                            };
                            if distributed < pot && first_idx != 255 {
                                let mut rem_seat: Seat = world
                                    .read_model((hand.table_id, first_idx));
                                rem_seat.chips += pot - distributed;
                                world.write_model(@rem_seat);
                            }
                        } else {
                            // S-01 FIX: All players folded or no valid bets.
                            // Refund proportionally to ALL players (including folded)
                            // based on total_bet to avoid losing chips.
                            let pot = hand.pot;
                            let mut total_all_bet: u128 = 0;
                            let mut ai: u8 = 0;
                            while ai < max {
                                let ph: PlayerHand = world.read_model((hand_id, ai));
                                if ph.player != 0.try_into().unwrap() {
                                    total_all_bet += ph.total_bet;
                                }
                                ai += 1;
                            };

                            if total_all_bet > 0 {
                                let mut distributed: u128 = 0;
                                let mut first_idx: u8 = 255;
                                let mut ri: u8 = 0;
                                while ri < max {
                                    let ph: PlayerHand = world.read_model((hand_id, ri));
                                    if ph.player != 0.try_into().unwrap()
                                        && ph.total_bet > 0 {
                                        if first_idx == 255 { first_idx = ri; }
                                        let share = pot * ph.total_bet / total_all_bet;
                                        let mut seat: Seat = world
                                            .read_model((hand.table_id, ri));
                                        seat.chips += share;
                                        world.write_model(@seat);
                                        distributed += share;
                                    }
                                    ri += 1;
                                };
                                if distributed < pot && first_idx != 255 {
                                    let mut rem_seat: Seat = world
                                        .read_model((hand.table_id, first_idx));
                                    rem_seat.chips += pot - distributed;
                                    world.write_model(@rem_seat);
                                }
                            }
                        }
                        hand.pot = 0;
                    }

                    // R-02/R-03 FIX: Mark hand as fully finalized so start_hand guard passes.
                    hand.phase = GamePhase::Setup;
                    hand.keys_submitted = hand.num_players;

                    // Force reset: table goes back to Waiting
                    let mut tbl: Table = world.read_model(hand.table_id);
                    tbl.state = crate::models::enums::TableState::Waiting;
                    // Advance dealer
                    let mut next_dealer = (tbl.dealer_seat + 1) % max;
                    let mut checked: u8 = 0;
                    while checked < max {
                        let s: Seat = world.read_model((hand.table_id, next_dealer));
                        if s.is_occupied {
                            break;
                        }
                        next_dealer = (next_dealer + 1) % max;
                        checked += 1;
                    };
                    tbl.dealer_seat = next_dealer;
                    world.write_model(@tbl);

                    // Reset ready states
                    let mut j: u8 = 0;
                    while j < max {
                        let mut seat: Seat = world.read_model((hand.table_id, j));
                        if seat.is_occupied {
                            seat.is_ready = false;
                            world.write_model(@seat);
                        }
                        j += 1;
                    };
                },
            }

            world.write_model(@hand);
        }
    }

    /// Find the nth occupied (non-sitting-out) seat at a table.
    fn find_nth_occupied_seat(
        ref world: dojo::world::WorldStorage,
        table_id: u64,
        n: u8,
        max_players: u8,
    ) -> u8 {
        let mut count: u8 = 0;
        let mut i: u8 = 0;
        while i < max_players {
            let seat: Seat = world.read_model((table_id, i));
            if seat.is_occupied && !seat.is_sitting_out {
                if count == n {
                    return i;
                }
                count += 1;
            }
            i += 1;
        };
        255
    }

    /// Check if a player has submitted all required reveal tokens for the current phase.
    fn has_submitted_all_required_tokens(
        ref world: dojo::world::WorldStorage,
        hand_id: u64,
        seat_idx: u8,
        phase: GamePhase,
        max_players: u8,
    ) -> bool {
        let comm: CommunityCards = world.read_model(hand_id);

        // Get positions this player needs to submit tokens for
        let positions: Array<u8> = match phase {
            GamePhase::DealingPreflop => {
                // Need tokens for all OTHER players' hole cards
                let mut pos: Array<u8> = array![];
                let mut i: u8 = 0;
                while i < max_players {
                    if i != seat_idx {
                        let ph: PlayerHand = world.read_model((hand_id, i));
                        if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                            pos.append(ph.hole_card_1_pos);
                            pos.append(ph.hole_card_2_pos);
                        }
                    }
                    i += 1;
                };
                pos
            },
            GamePhase::DealingFlop => {
                array![comm.flop_1_pos, comm.flop_2_pos, comm.flop_3_pos]
            },
            GamePhase::DealingTurn => {
                array![comm.turn_pos]
            },
            GamePhase::DealingRiver => {
                array![comm.river_pos]
            },
            _ => { array![] },
        };

        // Check if this player has submitted a token for each required position
        let mut all_submitted = true;
        let mut j: u32 = 0;
        while j < positions.len() {
            let pos = *positions.at(j);
            let token: crate::models::card::RevealToken = world
                .read_model((hand_id, pos, seat_idx));
            if !token.proof_verified {
                all_submitted = false;
                break;
            }
            j += 1;
        };
        all_submitted
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
