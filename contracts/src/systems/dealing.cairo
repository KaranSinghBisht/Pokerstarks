#[starknet::interface]
pub trait IDealing<T> {
    fn submit_reveal_token(
        ref self: T,
        hand_id: u64,
        card_position: u8,
        token_x: felt252,
        token_y: felt252,
        proof: Array<felt252>,
    );
    fn submit_reveal_tokens_batch(
        ref self: T,
        hand_id: u64,
        positions: Array<u8>,
        tokens_x: Array<felt252>,
        tokens_y: Array<felt252>,
        proofs: Array<Array<felt252>>,
    );
}

#[dojo::contract]
pub mod dealing_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp};
    use super::IDealing;
    use crate::systems::game_setup::{IVerifierDispatcher, IVerifierDispatcherTrait};
    use crate::models::hand::{Hand, PlayerHand};
    use crate::models::card::{RevealToken, CommunityCards};
    use crate::models::deck::EncryptedDeck;
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;
    use crate::utils::constants::BETTING_TIMEOUT;

    #[abi(embed_v0)]
    impl DealingImpl of IDealing<ContractState> {
        fn submit_reveal_token(
            ref self: ContractState,
            hand_id: u64,
            card_position: u8,
            token_x: felt252,
            token_y: felt252,
            proof: Array<felt252>,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut hand: Hand = world.read_model(hand_id);
            assert(
                hand.phase == GamePhase::DealingPreflop
                    || hand.phase == GamePhase::DealingFlop
                    || hand.phase == GamePhase::DealingTurn
                    || hand.phase == GamePhase::DealingRiver,
                'not dealing phase',
            );

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

            // A-10 FIX: For hole-card positions, owner cannot submit a reveal token
            // for their own card. Required contributors are all OTHER players.
            let hole_owner_seat = find_hole_card_owner_seat(
                ref world, hand_id, card_position, table.max_players,
            );
            if hand.phase == GamePhase::DealingPreflop && hole_owner_seat != 255 {
                assert(seat_idx != hole_owner_seat, 'owner cannot reveal own hole');
            }

            // A-05 FIX: Do NOT check has_folded here. In n-of-n aggregate-key ElGamal,
            // even folded players must submit reveal tokens for other players' decryption.
            let caller_ph: PlayerHand = world.read_model((hand_id, seat_idx));

            // Check token hasn't been submitted already
            let existing: RevealToken = world.read_model((hand_id, card_position, seat_idx));
            assert(!existing.proof_verified, 'token already submitted');

            // Verify proof via Garaga decrypt verifier stored on the table
            let verifier = IVerifierDispatcher {
                contract_address: table.decrypt_verifier,
            };
            let result = verifier.verify_ultra_keccak_zk_honk_proof(proof.span());
            assert(result.is_ok(), 'invalid decrypt proof');

            // Validate key public inputs from the proof
            // Layout: [generator_x, generator_y, pub_key_x, pub_key_y, c1_x, c1_y, token_x, token_y]
            let public_inputs = result.unwrap();
            assert(public_inputs.len() >= 8, 'insufficient proof inputs');

            // A-03 FIX: Assert proof's generator matches canonical Grumpkin generator.
            use crate::utils::constants::{GEN_X, GEN_Y};
            assert(
                *public_inputs.at(0) == GEN_X.into(), 'proof: wrong generator x',
            );
            assert(
                *public_inputs.at(1) == GEN_Y.into(), 'proof: wrong generator y',
            );

            // Verify public key matches submitter's stored key
            assert(
                *public_inputs.at(2) == caller_ph.public_key_x.into(),
                'proof: wrong pub key x',
            );
            assert(
                *public_inputs.at(3) == caller_ph.public_key_y.into(),
                'proof: wrong pub key y',
            );
            // Verify token matches what was submitted
            assert(
                *public_inputs.at(6) == token_x.into(),
                'proof: wrong token x',
            );
            assert(
                *public_inputs.at(7) == token_y.into(),
                'proof: wrong token y',
            );

            // F-02 FIX: Bind proof C1 to the on-chain encrypted deck at card_position.
            // Read the final shuffled deck (version = num_players, after all shuffles)
            let deck: EncryptedDeck = world.read_model((hand_id, hand.num_players));
            assert(deck.cards.len() == 208, 'deck not found');

            // Each card = 4 felt252s: [c1_x, c1_y, c2_x, c2_y]
            let pos: u32 = card_position.into();
            let deck_c1_x: felt252 = *deck.cards.at(pos * 4);
            let deck_c1_y: felt252 = *deck.cards.at(pos * 4 + 1);

            assert(*public_inputs.at(4) == deck_c1_x.into(), 'proof c1_x mismatch');
            assert(*public_inputs.at(5) == deck_c1_y.into(), 'proof c1_y mismatch');

            // Store the reveal token
            let token = RevealToken {
                hand_id,
                card_position,
                player_seat: seat_idx,
                token_x,
                token_y,
                proof_verified: true,
            };
            world.write_model(@token);

            // Check if all required tokens for this card position are collected
            // For hole cards: need tokens from all OTHER players (N-1 tokens)
            // For community cards: need tokens from ALL players (N tokens)
            let required_tokens = get_required_tokens_for_position(
                ref world, hand_id, card_position, hand.num_players, table.max_players,
            );
            let collected = count_tokens_for_position(
                ref world, hand_id, card_position, table.max_players,
            );

            if collected >= required_tokens {
                // A-10 FIX: Count-only checks are insufficient for hole cards.
                // Ensure every non-owner player has submitted before advancing.
                if hand.phase == GamePhase::DealingPreflop && hole_owner_seat != 255 {
                    if !has_all_non_owner_tokens(
                        ref world, hand_id, card_position, hole_owner_seat, table.max_players,
                    ) {
                        return;
                    }
                }

                // Check if ALL cards for this phase have enough tokens
                let phase_complete = check_phase_complete(
                    ref world, hand_id, hand.phase, hand.num_players, table.max_players,
                );

                if phase_complete {
                    // Advance to the next phase
                    let next_phase = match hand.phase {
                        GamePhase::DealingPreflop => GamePhase::BettingPreflop,
                        GamePhase::DealingFlop => GamePhase::BettingFlop,
                        GamePhase::DealingTurn => GamePhase::BettingTurn,
                        GamePhase::DealingRiver => GamePhase::BettingRiver,
                        _ => hand.phase, // shouldn't happen
                    };

                    hand.phase = next_phase;
                    hand.phase_deadline = get_block_timestamp() + BETTING_TIMEOUT;

                    // Set first betting player
                    if next_phase == GamePhase::BettingPreflop {
                        // Preflop: UTG = player after BB
                        // SB = first active after dealer, BB = first active after SB
                        let sb_seat = find_next_active_seat(
                            ref world, hand_id, hand.dealer_seat, table.max_players,
                        );
                        let bb_seat = find_next_active_seat(
                            ref world, hand_id, sb_seat, table.max_players,
                        );
                        let utg_seat = find_next_active_seat(
                            ref world, hand_id, bb_seat, table.max_players,
                        );
                        hand.current_turn_seat = utg_seat;
                    } else {
                        // Post-flop: first active player after dealer
                        let first_seat = find_next_active_seat(
                            ref world, hand_id, hand.dealer_seat, table.max_players,
                        );
                        hand.current_turn_seat = first_seat;
                    }

                    // Reset has_acted for all players
                    let mut k: u8 = 0;
                    while k < table.max_players {
                        let mut ph: PlayerHand = world.read_model((hand_id, k));
                        if ph.player != 0.try_into().unwrap() && !ph.has_folded && !ph.is_all_in {
                            ph.has_acted = false;
                            world.write_model(@ph);
                        }
                        k += 1;
                    };

                    // Reset current_bet for new betting round (except preflop which has BB)
                    if hand.phase != GamePhase::BettingPreflop {
                        hand.current_bet = 0;
                        // Reset bet_this_round for all players
                        let mut m: u8 = 0;
                        while m < table.max_players {
                            let mut ph: PlayerHand = world.read_model((hand_id, m));
                            if ph.player != 0.try_into().unwrap() {
                                ph.bet_this_round = 0;
                                world.write_model(@ph);
                            }
                            m += 1;
                        };
                    }

                    world.write_model(@hand);
                }
            }
        }

        fn submit_reveal_tokens_batch(
            ref self: ContractState,
            hand_id: u64,
            positions: Array<u8>,
            tokens_x: Array<felt252>,
            tokens_y: Array<felt252>,
            proofs: Array<Array<felt252>>,
        ) {
            assert(positions.len() == tokens_x.len(), 'length mismatch');
            assert(positions.len() == tokens_y.len(), 'length mismatch');
            assert(positions.len() == proofs.len(), 'length mismatch');

            let mut i: u32 = 0;
            while i < positions.len() {
                // Reconstruct individual proof array
                let mut single_proof: Array<felt252> = array![];
                let proof_span = proofs.at(i).span();
                let mut pi: u32 = 0;
                while pi < proof_span.len() {
                    single_proof.append(*proof_span.at(pi));
                    pi += 1;
                };

                self
                    .submit_reveal_token(
                        hand_id,
                        *positions.at(i),
                        *tokens_x.at(i),
                        *tokens_y.at(i),
                        single_proof,
                    );
                i += 1;
            };
        }
    }

    /// Count active (non-folded) players for token requirements.
    fn count_active_players(
        ref world: dojo::world::WorldStorage,
        hand_id: u64,
        max_players: u8,
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

    /// Determine how many reveal tokens are needed for a card position.
    /// A-05 FIX: Uses num_players (all original hand participants) instead of
    /// active_players. In n-of-n aggregate-key ElGamal, ALL players' tokens
    /// are needed for decryption regardless of fold status.
    fn get_required_tokens_for_position(
        ref world: dojo::world::WorldStorage,
        hand_id: u64,
        card_position: u8,
        num_players: u8,
        _max_players: u8,
    ) -> u8 {
        let comm: CommunityCards = world.read_model(hand_id);

        // Check if this is a community card position
        if card_position == comm.flop_1_pos
            || card_position == comm.flop_2_pos
            || card_position == comm.flop_3_pos
            || card_position == comm.turn_pos
            || card_position == comm.river_pos {
            return num_players; // all players must contribute
        }

        // It's a hole card — need (num_players - 1) tokens (everyone except the owner)
        if num_players > 0 { num_players - 1 } else { 0 }
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

    fn find_hole_card_owner_seat(
        ref world: dojo::world::WorldStorage, hand_id: u64, card_position: u8, max_players: u8,
    ) -> u8 {
        let comm: CommunityCards = world.read_model(hand_id);
        let is_community = card_position == comm.flop_1_pos
            || card_position == comm.flop_2_pos
            || card_position == comm.flop_3_pos
            || card_position == comm.turn_pos
            || card_position == comm.river_pos;
        if is_community {
            return 255;
        }

        let mut i: u8 = 0;
        while i < max_players {
            let ph: PlayerHand = world.read_model((hand_id, i));
            if ph.player != 0.try_into().unwrap()
                && (ph.hole_card_1_pos == card_position || ph.hole_card_2_pos == card_position) {
                return i;
            }
            i += 1;
        };
        255
    }

    fn has_all_non_owner_tokens(
        ref world: dojo::world::WorldStorage,
        hand_id: u64,
        card_position: u8,
        owner_seat: u8,
        max_players: u8,
    ) -> bool {
        let mut i: u8 = 0;
        while i < max_players {
            let ph: PlayerHand = world.read_model((hand_id, i));
            if ph.player != 0.try_into().unwrap() && i != owner_seat {
                let token: RevealToken = world.read_model((hand_id, card_position, i));
                if !token.proof_verified {
                    return false;
                }
            }
            i += 1;
        };
        true
    }

    /// Check if all cards for the current dealing phase have received enough tokens.
    /// A-05 FIX: Uses num_players for token thresholds (n-of-n ElGamal).
    fn check_phase_complete(
        ref world: dojo::world::WorldStorage,
        hand_id: u64,
        phase: GamePhase,
        num_players: u8,
        max_players: u8,
    ) -> bool {
        let comm: CommunityCards = world.read_model(hand_id);

        match phase {
            GamePhase::DealingPreflop => {
                // Check ALL players' hole cards (including folded — they still need tokens)
                let mut j: u8 = 0;
                let mut all_done = true;
                while j < max_players {
                    let ph: PlayerHand = world.read_model((hand_id, j));
                    if ph.player != 0.try_into().unwrap() {
                        if !has_all_non_owner_tokens(
                            ref world, hand_id, ph.hole_card_1_pos, j, max_players,
                        ) || !has_all_non_owner_tokens(
                            ref world, hand_id, ph.hole_card_2_pos, j, max_players,
                        ) {
                            all_done = false;
                            break;
                        }
                    }
                    j += 1;
                };
                all_done
            },
            GamePhase::DealingFlop => {
                let t1 = count_tokens_for_position(
                    ref world, hand_id, comm.flop_1_pos, max_players,
                );
                let t2 = count_tokens_for_position(
                    ref world, hand_id, comm.flop_2_pos, max_players,
                );
                let t3 = count_tokens_for_position(
                    ref world, hand_id, comm.flop_3_pos, max_players,
                );
                t1 >= num_players && t2 >= num_players && t3 >= num_players
            },
            GamePhase::DealingTurn => {
                let t = count_tokens_for_position(
                    ref world, hand_id, comm.turn_pos, max_players,
                );
                t >= num_players
            },
            GamePhase::DealingRiver => {
                let t = count_tokens_for_position(
                    ref world, hand_id, comm.river_pos, max_players,
                );
                t >= num_players
            },
            _ => false,
        }
    }

    fn find_next_active_seat(
        ref world: dojo::world::WorldStorage, hand_id: u64, current_seat: u8, max_players: u8,
    ) -> u8 {
        let mut next = (current_seat + 1) % max_players;
        let mut checked: u8 = 0;
        while checked < max_players {
            let ph: PlayerHand = world.read_model((hand_id, next));
            if ph.player != 0.try_into().unwrap() && !ph.has_folded && !ph.is_all_in {
                break;
            }
            next = (next + 1) % max_players;
            checked += 1;
        };
        next
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
