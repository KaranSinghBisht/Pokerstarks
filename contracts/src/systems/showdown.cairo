#[starknet::interface]
pub trait IShowdown<T> {
    /// Submit a decrypted card ID for a specific deck position.
    /// ALL active players must submit the same card_id for consensus.
    fn submit_card_decryption(
        ref self: T, hand_id: u64, card_position: u8, card_id: u8,
    );
    /// Called after all card positions have reached consensus to determine the winner
    fn compute_winner(ref self: T, hand_id: u64);
}

#[starknet::interface]
pub trait IERC20<T> {
    fn transfer(ref self: T, recipient: starknet::ContractAddress, amount: u256) -> bool;
}

#[dojo::contract]
pub mod showdown_system {
    use dojo::model::ModelStorage;
    use starknet::get_caller_address;
    use super::{IShowdown, IERC20Dispatcher, IERC20DispatcherTrait};
    use crate::models::hand::{Hand, PlayerHand};
    use crate::models::card::{RevealToken, CommunityCards, CardDecryptionVote};
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;
    use crate::utils::hand_evaluator::evaluate_best_hand;
    use crate::utils::constants::CARD_NOT_DEALT;

    const ZERO_ADDR: felt252 = 0;

    #[abi(embed_v0)]
    impl ShowdownImpl of IShowdown<ContractState> {
        fn submit_card_decryption(
            ref self: ContractState,
            hand_id: u64,
            card_position: u8,
            card_id: u8,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Showdown, 'not showdown phase');

            assert(card_id < 52, 'invalid card id');
            assert(card_position < 52, 'invalid card position');

            // Find caller's seat
            let table: Table = world.read_model(hand.table_id);
            let mut seat_idx: u8 = 255;
            let mut i: u8 = 0;
            while i < table.max_players {
                let seat: Seat = world.read_model((hand.table_id, i));
                if seat.is_occupied && seat.player == caller {
                    seat_idx = i;
                    break;
                }
                i += 1;
            };
            assert(seat_idx != 255, 'player not at table');

            let ph: PlayerHand = world.read_model((hand_id, seat_idx));
            assert(!ph.has_folded, 'player folded');

            // Check not already submitted for this position
            let existing: CardDecryptionVote = world
                .read_model((hand_id, card_position, seat_idx));
            assert(!existing.submitted, 'already voted');

            // Verify that reveal tokens exist for this card position,
            // proving the card CAN be decrypted.
            let tokens_collected = count_tokens_for_position(
                ref world, hand_id, card_position, table.max_players,
            );
            let required = get_required_tokens_for_card(
                ref world, hand_id, card_position, table.max_players,
            );
            assert(tokens_collected >= required, 'tokens not collected');

            // Store the vote
            let vote = CardDecryptionVote {
                hand_id, card_position, voter_seat: seat_idx, card_id, submitted: true,
            };
            world.write_model(@vote);

            // Count votes and check consensus
            let active_count = count_active_players(ref world, hand_id, table.max_players);
            let mut vote_count: u8 = 0;
            let mut all_agree = true;
            let mut first_card_id: u8 = card_id;
            let mut j: u8 = 0;
            while j < table.max_players {
                let v: CardDecryptionVote = world.read_model((hand_id, card_position, j));
                if v.submitted {
                    vote_count += 1;
                    if vote_count == 1 {
                        first_card_id = v.card_id;
                    } else if v.card_id != first_card_id {
                        all_agree = false;
                    }
                }
                j += 1;
            };

            // When all active players have voted, resolve
            if vote_count == active_count {
                assert(all_agree, 'card decryption disagreement');

                // Consensus reached — store the accepted card ID
                let comm: CommunityCards = world.read_model(hand_id);

                // Is this a community card position?
                if card_position == comm.flop_1_pos {
                    let mut c: CommunityCards = world.read_model(hand_id);
                    c.flop_1 = first_card_id;
                    world.write_model(@c);
                } else if card_position == comm.flop_2_pos {
                    let mut c: CommunityCards = world.read_model(hand_id);
                    c.flop_2 = first_card_id;
                    world.write_model(@c);
                } else if card_position == comm.flop_3_pos {
                    let mut c: CommunityCards = world.read_model(hand_id);
                    c.flop_3 = first_card_id;
                    world.write_model(@c);
                } else if card_position == comm.turn_pos {
                    let mut c: CommunityCards = world.read_model(hand_id);
                    c.turn = first_card_id;
                    world.write_model(@c);
                } else if card_position == comm.river_pos {
                    let mut c: CommunityCards = world.read_model(hand_id);
                    c.river = first_card_id;
                    world.write_model(@c);
                } else {
                    // It's a hole card — find whose hole card position this is
                    let mut k: u8 = 0;
                    while k < table.max_players {
                        let mut player_ph: PlayerHand = world.read_model((hand_id, k));
                        if player_ph.player != ZERO_ADDR.try_into().unwrap() {
                            if player_ph.hole_card_1_pos == card_position
                                && player_ph.hole_card_1_id == CARD_NOT_DEALT {
                                player_ph.hole_card_1_id = first_card_id;
                                world.write_model(@player_ph);
                                break;
                            } else if player_ph.hole_card_2_pos == card_position
                                && player_ph.hole_card_2_id == CARD_NOT_DEALT {
                                player_ph.hole_card_2_id = first_card_id;
                                world.write_model(@player_ph);
                                break;
                            }
                        }
                        k += 1;
                    };
                }
            }
        }

        fn compute_winner(ref self: ContractState, hand_id: u64) {
            let mut world = self.world_default();

            let mut hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Showdown, 'not showdown phase');

            let table: Table = world.read_model(hand.table_id);
            let comm: CommunityCards = world.read_model(hand_id);

            // Verify all community cards are revealed
            assert(comm.flop_1 != CARD_NOT_DEALT, 'community cards not set');

            // Check all non-folded players have revealed
            let mut all_revealed = true;
            let mut i: u8 = 0;
            while i < table.max_players {
                let ph: PlayerHand = world.read_model((hand_id, i));
                if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                    if ph.hole_card_1_id == CARD_NOT_DEALT {
                        all_revealed = false;
                        break;
                    }
                }
                i += 1;
            };
            assert(all_revealed, 'not all players revealed');

            // Evaluate each player's hand and find the winner
            let mut best_rank: u8 = 0;
            let mut best_tb: u32 = 0;
            let mut winner_seat: u8 = 255;

            let mut j: u8 = 0;
            while j < table.max_players {
                let ph: PlayerHand = world.read_model((hand_id, j));
                if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                    let cards = array![
                        ph.hole_card_1_id,
                        ph.hole_card_2_id,
                        comm.flop_1,
                        comm.flop_2,
                        comm.flop_3,
                        comm.turn,
                        comm.river,
                    ];

                    let (rank, tb) = evaluate_best_hand(cards.span());

                    if rank > best_rank || (rank == best_rank && tb > best_tb) {
                        best_rank = rank;
                        best_tb = tb;
                        winner_seat = j;
                    }
                }
                j += 1;
            };

            assert(winner_seat != 255, 'no winner found');

            // Deduct rake before distribution
            if table.rake_bps > 0 {
                let rake_amount = hand.pot * table.rake_bps.into() / 10000;
                let rake = if rake_amount > table.rake_cap {
                    table.rake_cap
                } else {
                    rake_amount
                };
                hand.pot -= rake;

                if table.token_address != ZERO_ADDR.try_into().unwrap()
                    && table.rake_recipient != ZERO_ADDR.try_into().unwrap() {
                    let token = IERC20Dispatcher { contract_address: table.token_address };
                    let success = token.transfer(table.rake_recipient, rake.into());
                    assert(success, 'rake transfer failed');
                }
            }

            // Split pot: find ALL players with the same best hand
            let mut winner_count: u128 = 0;
            let mut w: u8 = 0;
            while w < table.max_players {
                let wph: PlayerHand = world.read_model((hand_id, w));
                if wph.player != 0.try_into().unwrap() && !wph.has_folded {
                    let wcards = array![
                        wph.hole_card_1_id,
                        wph.hole_card_2_id,
                        comm.flop_1,
                        comm.flop_2,
                        comm.flop_3,
                        comm.turn,
                        comm.river,
                    ];
                    let (wrank, wtb) = evaluate_best_hand(wcards.span());
                    if wrank == best_rank && wtb == best_tb {
                        winner_count += 1;
                    }
                }
                w += 1;
            };

            // Distribute pot equally among winners (remainder to first winner)
            let share = hand.pot / winner_count;
            let remainder = hand.pot % winner_count;
            let mut first_winner = true;
            let mut d: u8 = 0;
            while d < table.max_players {
                let dph: PlayerHand = world.read_model((hand_id, d));
                if dph.player != 0.try_into().unwrap() && !dph.has_folded {
                    let dcards = array![
                        dph.hole_card_1_id,
                        dph.hole_card_2_id,
                        comm.flop_1,
                        comm.flop_2,
                        comm.flop_3,
                        comm.turn,
                        comm.river,
                    ];
                    let (drank, dtb) = evaluate_best_hand(dcards.span());
                    if drank == best_rank && dtb == best_tb {
                        let mut winner_seat_model: Seat = world
                            .read_model((hand.table_id, d));
                        let award = if first_winner {
                            first_winner = false;
                            share + remainder
                        } else {
                            share
                        };
                        winner_seat_model.chips += award;
                        world.write_model(@winner_seat_model);
                    }
                }
                d += 1;
            };

            // Transition to settling
            hand.pot = 0;
            hand.phase = GamePhase::Settling;
            world.write_model(@hand);
        }
    }

    fn count_active_players(
        ref world: dojo::world::WorldStorage, hand_id: u64, max_players: u8,
    ) -> u8 {
        let mut count: u8 = 0;
        let mut i: u8 = 0;
        while i < max_players {
            let ph: PlayerHand = world.read_model((hand_id, i));
            if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                count += 1;
            }
            i += 1;
        };
        count
    }

    fn count_tokens_for_position(
        ref world: dojo::world::WorldStorage, hand_id: u64, card_position: u8, max_players: u8,
    ) -> u8 {
        let mut count: u8 = 0;
        let mut i: u8 = 0;
        while i < max_players {
            let token: RevealToken = world.read_model((hand_id, card_position, i));
            if token.proof_verified {
                count += 1;
            }
            i += 1;
        };
        count
    }

    fn get_required_tokens_for_card(
        ref world: dojo::world::WorldStorage,
        hand_id: u64,
        card_position: u8,
        max_players: u8,
    ) -> u8 {
        let active = count_active_players(ref world, hand_id, max_players);
        let comm: CommunityCards = world.read_model(hand_id);

        // Community cards need tokens from ALL active players
        if card_position == comm.flop_1_pos
            || card_position == comm.flop_2_pos
            || card_position == comm.flop_3_pos
            || card_position == comm.turn_pos
            || card_position == comm.river_pos {
            return active;
        }

        // Hole cards need tokens from (active - 1) players
        if active > 0 { active - 1 } else { 0 }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
