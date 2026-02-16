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
    use crate::models::card::{RevealToken, CommunityCards, CardDecryptionVote, SidePot};
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

            let active_count = count_active_players(ref world, hand_id, table.max_players);
            let mut vote_count: u8 = 0;
            let mut j: u8 = 0;
            while j < table.max_players {
                let v: CardDecryptionVote = world.read_model((hand_id, card_position, j));
                if v.submitted {
                    vote_count += 1;
                }
                j += 1;
            };

            if vote_count == active_count {
                // Majority vote: find the card_id with the most votes.
                // In honest play all players agree. On disagreement, majority wins.
                // Tally votes per card_id (max 52 distinct values).
                let (majority_id, majority_count) = find_majority_vote(
                    ref world, hand_id, card_position, table.max_players,
                );

                // Require strict majority (> 50%). For 2-player ties where
                // both disagree, no majority exists — skip and let timeout resolve.
                if majority_count * 2 <= active_count {
                    return;
                }

                let first_card_id = majority_id;
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

            // A-06 FIX: Verify ALL 5 community cards are revealed (not just flop_1)
            assert(comm.flop_1 != CARD_NOT_DEALT, 'flop_1 not dealt');
            assert(comm.flop_2 != CARD_NOT_DEALT, 'flop_2 not dealt');
            assert(comm.flop_3 != CARD_NOT_DEALT, 'flop_3 not dealt');
            assert(comm.turn != CARD_NOT_DEALT, 'turn not dealt');
            assert(comm.river != CARD_NOT_DEALT, 'river not dealt');

            // A-06 FIX: Validate community card IDs in range and unique
            assert(comm.flop_1 < 52, 'invalid flop_1 id');
            assert(comm.flop_2 < 52, 'invalid flop_2 id');
            assert(comm.flop_3 < 52, 'invalid flop_3 id');
            assert(comm.turn < 52, 'invalid turn id');
            assert(comm.river < 52, 'invalid river id');
            assert(comm.flop_1 != comm.flop_2, 'duplicate community card');
            assert(comm.flop_1 != comm.flop_3, 'duplicate community card');
            assert(comm.flop_1 != comm.turn, 'duplicate community card');
            assert(comm.flop_1 != comm.river, 'duplicate community card');
            assert(comm.flop_2 != comm.flop_3, 'duplicate community card');
            assert(comm.flop_2 != comm.turn, 'duplicate community card');
            assert(comm.flop_2 != comm.river, 'duplicate community card');
            assert(comm.flop_3 != comm.turn, 'duplicate community card');
            assert(comm.flop_3 != comm.river, 'duplicate community card');
            assert(comm.turn != comm.river, 'duplicate community card');

            // A-06 FIX: Check all non-folded players have BOTH hole cards revealed
            let mut all_revealed = true;
            let mut i: u8 = 0;
            while i < table.max_players {
                let ph: PlayerHand = world.read_model((hand_id, i));
                if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                    if ph.hole_card_1_id == CARD_NOT_DEALT
                        || ph.hole_card_2_id == CARD_NOT_DEALT {
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
                    // A-06 FIX: Validate hole card ranges and uniqueness
                    assert(ph.hole_card_1_id < 52, 'invalid hole card 1');
                    assert(ph.hole_card_2_id < 52, 'invalid hole card 2');
                    assert(ph.hole_card_1_id != ph.hole_card_2_id, 'duplicate hole cards');
                    assert(ph.hole_card_1_id != comm.flop_1, 'hole dupes community');
                    assert(ph.hole_card_1_id != comm.flop_2, 'hole dupes community');
                    assert(ph.hole_card_1_id != comm.flop_3, 'hole dupes community');
                    assert(ph.hole_card_1_id != comm.turn, 'hole dupes community');
                    assert(ph.hole_card_1_id != comm.river, 'hole dupes community');
                    assert(ph.hole_card_2_id != comm.flop_1, 'hole dupes community');
                    assert(ph.hole_card_2_id != comm.flop_2, 'hole dupes community');
                    assert(ph.hole_card_2_id != comm.flop_3, 'hole dupes community');
                    assert(ph.hole_card_2_id != comm.turn, 'hole dupes community');
                    assert(ph.hole_card_2_id != comm.river, 'hole dupes community');

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
            let mut total_rake: u128 = 0;
            if table.rake_bps > 0 {
                let rake_amount = hand.pot * table.rake_bps.into() / 10000;
                let rake = if rake_amount > table.rake_cap {
                    table.rake_cap
                } else {
                    rake_amount
                };
                total_rake = rake;
                hand.pot -= rake;

                if table.token_address != ZERO_ADDR.try_into().unwrap()
                    && table.rake_recipient != ZERO_ADDR.try_into().unwrap() {
                    let token = IERC20Dispatcher { contract_address: table.token_address };
                    let success = token.transfer(table.rake_recipient, rake.into());
                    assert(success, 'rake transfer failed');
                }
            }

            // A-07 FIX: Check if side pots exist. If so, distribute per-pot.
            // Otherwise fall back to single-pot distribution (backward compatible).
            let first_side_pot: SidePot = world.read_model((hand_id, 0_u8));
            let has_side_pots = first_side_pot.amount > 0;

            if has_side_pots {
                // Distribute each side pot to its winner(s)
                // Deduct proportional rake from each pot
                let mut pot_idx: u8 = 0;
                let mut total_pot_sum: u128 = 0;

                // First pass: sum all side pot amounts for rake proportion
                let mut sum_idx: u8 = 0;
                while sum_idx < 10 { // max 10 side pots (more than enough for 6 players)
                    let sp: SidePot = world.read_model((hand_id, sum_idx));
                    if sp.amount == 0 {
                        break;
                    }
                    total_pot_sum += sp.amount;
                    sum_idx += 1;
                };

                // Second pass: distribute each pot
                while pot_idx < 10 {
                    let sp: SidePot = world.read_model((hand_id, pot_idx));
                    if sp.amount == 0 {
                        break;
                    }

                    // Proportional rake for this pot
                    let pot_rake = if total_pot_sum > 0 {
                        total_rake * sp.amount / total_pot_sum
                    } else {
                        0
                    };
                    let distributable = sp.amount - pot_rake;

                    // Find best hand among eligible players for this pot
                    let mut pot_best_rank: u8 = 0;
                    let mut pot_best_tb: u32 = 0;
                    let mut ep: u8 = 0;
                    while ep < table.max_players {
                        // Check if this seat is eligible (bit set in mask)
                        if (sp.eligible_mask & shl_u8(1, ep)) != 0 {
                            let eph: PlayerHand = world.read_model((hand_id, ep));
                            if eph.player != 0.try_into().unwrap() && !eph.has_folded {
                                let ecards = array![
                                    eph.hole_card_1_id,
                                    eph.hole_card_2_id,
                                    comm.flop_1,
                                    comm.flop_2,
                                    comm.flop_3,
                                    comm.turn,
                                    comm.river,
                                ];
                                let (erank, etb) = evaluate_best_hand(ecards.span());
                                if erank > pot_best_rank
                                    || (erank == pot_best_rank && etb > pot_best_tb) {
                                    pot_best_rank = erank;
                                    pot_best_tb = etb;
                                }
                            }
                        }
                        ep += 1;
                    };

                    // Count winners and distribute
                    let mut pot_winner_count: u128 = 0;
                    let mut wc: u8 = 0;
                    while wc < table.max_players {
                        if (sp.eligible_mask & shl_u8(1, wc)) != 0 {
                            let wph: PlayerHand = world.read_model((hand_id, wc));
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
                                let (wr, wt) = evaluate_best_hand(wcards.span());
                                if wr == pot_best_rank && wt == pot_best_tb {
                                    pot_winner_count += 1;
                                }
                            }
                        }
                        wc += 1;
                    };

                    if pot_winner_count > 0 {
                        let pot_share = distributable / pot_winner_count;
                        let pot_remainder = distributable % pot_winner_count;
                        let mut first_pot_winner = true;
                        let mut dp: u8 = 0;
                        while dp < table.max_players {
                            if (sp.eligible_mask & shl_u8(1, dp)) != 0 {
                                let dph: PlayerHand = world.read_model((hand_id, dp));
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
                                    let (dr, dt) = evaluate_best_hand(dcards.span());
                                    if dr == pot_best_rank && dt == pot_best_tb {
                                        let mut ws: Seat = world
                                            .read_model((hand.table_id, dp));
                                        let award = if first_pot_winner {
                                            first_pot_winner = false;
                                            pot_share + pot_remainder
                                        } else {
                                            pot_share
                                        };
                                        ws.chips += award;
                                        world.write_model(@ws);
                                    }
                                }
                            }
                            dp += 1;
                        };
                    }

                    pot_idx += 1;
                };
            } else {
                // No side pots — single pot distribution (original logic)
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
            }

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

    /// Returns (card_id, vote_count) for the card_id with the most votes.
    fn find_majority_vote(
        ref world: dojo::world::WorldStorage,
        hand_id: u64,
        card_position: u8,
        max_players: u8,
    ) -> (u8, u8) {
        // Collect submitted votes into parallel arrays (max 6 players)
        let mut vote_ids: Array<u8> = array![];
        let mut i: u8 = 0;
        while i < max_players {
            let v: CardDecryptionVote = world.read_model((hand_id, card_position, i));
            if v.submitted {
                vote_ids.append(v.card_id);
            }
            i += 1;
        };

        let n = vote_ids.len();
        if n == 0 {
            return (0, 0);
        }

        // Find the card_id with the highest count (brute force, N <= 6)
        let mut best_id: u8 = *vote_ids.at(0);
        let mut best_count: u8 = 0;
        let mut vi: u32 = 0;
        while vi < n {
            let candidate = *vote_ids.at(vi);
            let mut count: u8 = 0;
            let mut vj: u32 = 0;
            while vj < n {
                if *vote_ids.at(vj) == candidate {
                    count += 1;
                }
                vj += 1;
            };
            if count > best_count {
                best_count = count;
                best_id = candidate;
            }
            vi += 1;
        };

        (best_id, best_count)
    }

    fn shl_u8(val: u8, shift: u8) -> u8 {
        if shift == 0 { return val; }
        if shift == 1 { return val * 2; }
        if shift == 2 { return val * 4; }
        if shift == 3 { return val * 8; }
        if shift == 4 { return val * 16; }
        if shift == 5 { return val * 32; }
        0 // shift >= 6 would overflow u8 for val=1
    }

    /// A-05 FIX: Use num_players (n-of-n) instead of active_players for token requirements.
    fn get_required_tokens_for_card(
        ref world: dojo::world::WorldStorage,
        hand_id: u64,
        card_position: u8,
        _max_players: u8,
    ) -> u8 {
        let hand: Hand = world.read_model(hand_id);
        let comm: CommunityCards = world.read_model(hand_id);

        // Community cards need tokens from ALL original players
        if card_position == comm.flop_1_pos
            || card_position == comm.flop_2_pos
            || card_position == comm.flop_3_pos
            || card_position == comm.turn_pos
            || card_position == comm.river_pos {
            return hand.num_players;
        }

        // Hole cards need tokens from (num_players - 1) players
        if hand.num_players > 0 { hand.num_players - 1 } else { 0 }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
