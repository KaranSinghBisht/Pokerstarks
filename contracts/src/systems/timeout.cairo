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
                        // Skip this shuffler: advance progress
                        // The skipped player's shuffle slot is bypassed;
                        // remaining players still shuffle in order
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
                    // Find players who haven't submitted required reveal tokens
                    // and fold them so the game can progress
                    let mut folded_any = false;
                    let mut i: u8 = 0;
                    while i < max {
                        let ph: PlayerHand = world.read_model((hand_id, i));
                        if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                            if !has_submitted_all_required_tokens(
                                ref world, hand_id, i, hand.phase, max,
                            ) {
                                // Fold this player for timing out
                                let mut fold_ph: PlayerHand = world.read_model((hand_id, i));
                                fold_ph.has_folded = true;
                                world.write_model(@fold_ph);
                                hand.active_players -= 1;
                                folded_any = true;

                                let mut seat: Seat = world.read_model((hand.table_id, i));
                                seat.is_sitting_out = true;
                                world.write_model(@seat);
                            }
                        }
                        i += 1;
                    };

                    if hand.active_players <= 1 {
                        hand.phase = GamePhase::Settling;
                    } else {
                        // Extend deadline to let remaining players finish
                        hand.phase_deadline = get_block_timestamp() + 30;
                    }
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
                            hand.phase =
                                match hand.phase {
                                    GamePhase::BettingPreflop => GamePhase::DealingFlop,
                                    GamePhase::BettingFlop => GamePhase::DealingTurn,
                                    GamePhase::BettingTurn => GamePhase::DealingRiver,
                                    GamePhase::BettingRiver => GamePhase::Showdown,
                                    _ => hand.phase,
                                };
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
                    // Fold ALL unrevealed players (not just current_turn_seat
                    // which is stale from betting)
                    let mut i: u8 = 0;
                    while i < max {
                        let ph: PlayerHand = world.read_model((hand_id, i));
                        if ph.player != 0.try_into().unwrap()
                            && !ph.has_folded
                            && ph.hole_card_1_id == CARD_NOT_DEALT {
                            // This player hasn't revealed — fold them
                            let mut fold_ph: PlayerHand = world.read_model((hand_id, i));
                            fold_ph.has_folded = true;
                            world.write_model(@fold_ph);
                            hand.active_players -= 1;
                        }
                        i += 1;
                    };

                    if hand.active_players <= 1 {
                        // Last player standing wins
                        hand.phase = GamePhase::Settling;
                    } else {
                        // Some players revealed, some didn't — proceed to
                        // compute_winner with whoever revealed
                        hand.phase_deadline = get_block_timestamp() + 30;
                    }
                },
                GamePhase::Settling => {
                    // Settling timeout: auto-distribute pot
                    // Find the first non-folded player and give them the pot
                    if hand.pot > 0 {
                        let mut i: u8 = 0;
                        while i < max {
                            let ph: PlayerHand = world.read_model((hand_id, i));
                            if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                                let mut winner_seat: Seat = world
                                    .read_model((hand.table_id, i));
                                winner_seat.chips += hand.pot;
                                world.write_model(@winner_seat);
                                hand.pot = 0;
                                break;
                            }
                            i += 1;
                        };
                    }

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
