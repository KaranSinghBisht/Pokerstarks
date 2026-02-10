// Verifier interface (deployed as separate Garaga-generated contract)
#[starknet::interface]
pub trait IVerifier<T> {
    fn verify_ultra_keccak_zk_honk_proof(
        self: @T, full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252>;
}

#[starknet::interface]
pub trait IGameSetup<T> {
    fn start_hand(ref self: T, table_id: u64);
    fn submit_public_key(ref self: T, hand_id: u64, pk_x: felt252, pk_y: felt252);
    fn submit_aggregate_key(ref self: T, hand_id: u64, agg_pk_x: felt252, agg_pk_y: felt252);
    fn submit_initial_deck_hash(ref self: T, hand_id: u64, deck_hash: felt252);
    fn submit_initial_deck(ref self: T, hand_id: u64, deck: Array<felt252>);
}

#[dojo::contract]
pub mod game_setup_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp};
    use core::poseidon::poseidon_hash_span;
    use super::IGameSetup;
    use crate::models::hand::{Hand, PlayerHand, HandCounter};
    use crate::models::table::{Table, Seat};
    use crate::models::card::CommunityCards;
    use crate::models::deck::EncryptedDeck;
    use crate::models::enums::{GamePhase, TableState};
    use crate::utils::constants::{SETUP_TIMEOUT, SHUFFLE_TIMEOUT, CARD_NOT_DEALT};

    #[abi(embed_v0)]
    impl GameSetupImpl of IGameSetup<ContractState> {
        /// Called by the lobby when all players are ready. Creates a new hand,
        /// assigns card positions, posts blinds, and transitions to Setup phase.
        fn start_hand(ref self: ContractState, table_id: u64) {
            let mut world = self.world_default();

            let mut table: Table = world.read_model(table_id);
            assert(table.state == TableState::InProgress, 'table not in progress');

            // Guard against duplicate start_hand calls (race condition)
            if table.current_hand_id > 0 {
                let existing_hand: Hand = world.read_model(table.current_hand_id);
                assert(
                    existing_hand.phase == GamePhase::Settling
                        || existing_hand.phase == GamePhase::Setup,
                    'hand already active',
                );
                if existing_hand.phase == GamePhase::Setup {
                    assert(
                        existing_hand.keys_submitted == existing_hand.num_players,
                        'hand already started',
                    );
                }
            }

            // Get next hand ID
            let mut hand_counter: HandCounter = world.read_model(0_u8);
            let hand_id = hand_counter.next_id;
            hand_counter.next_id += 1;
            world.write_model(@hand_counter);

            // Count active players and find dealer
            let dealer_seat = table.dealer_seat;
            let mut num_players: u8 = 0;
            let mut i: u8 = 0;
            while i < table.max_players {
                let seat: Seat = world.read_model((table_id, i));
                if seat.is_occupied && !seat.is_sitting_out {
                    num_players += 1;
                }
                i += 1;
            };
            assert(num_players >= 2, 'need at least 2 players');

            // Find small blind and big blind seats (next occupied seats after dealer)
            let sb_seat = find_next_occupied_seat(
                ref world, table_id, dealer_seat, table.max_players,
            );
            let bb_seat = find_next_occupied_seat(
                ref world, table_id, sb_seat, table.max_players,
            );

            // Generate deterministic deck seed from hand_id + block timestamp
            let now = get_block_timestamp();
            let seed_input = array![hand_id.into(), now.into()];
            let deck_seed = poseidon_hash_span(seed_input.span());

            // Create the hand
            let hand = Hand {
                hand_id,
                table_id,
                phase: GamePhase::Setup,
                pot: 0,
                current_bet: 0,
                active_players: num_players,
                num_players,
                current_turn_seat: 0,
                dealer_seat,
                shuffle_progress: 0,
                started_at: now,
                phase_deadline: now + SETUP_TIMEOUT,
                agg_pub_key_x: 0,
                agg_pub_key_y: 0,
                keys_submitted: 0,
                agg_key_confirmations: 0,
                deck_seed,
                deck_hash_confirmations: 0,
                initial_deck_hash: 0,
            };
            world.write_model(@hand);

            // Create PlayerHand for each seated player
            let mut card_pos: u8 = 0;
            let mut j: u8 = 0;
            while j < table.max_players {
                let seat: Seat = world.read_model((table_id, j));
                if seat.is_occupied && !seat.is_sitting_out {
                    let ph = PlayerHand {
                        hand_id,
                        seat_index: j,
                        player: seat.player,
                        public_key_x: 0,
                        public_key_y: 0,
                        bet_this_round: 0,
                        total_bet: 0,
                        has_folded: false,
                        has_acted: false,
                        is_all_in: false,
                        hole_card_1_pos: card_pos,
                        hole_card_2_pos: card_pos + 1,
                        hole_card_1_id: CARD_NOT_DEALT,
                        hole_card_2_id: CARD_NOT_DEALT,
                        submitted_agg_x: 0,
                        submitted_agg_y: 0,
                        submitted_deck_hash: 0,
                    };
                    world.write_model(@ph);
                    card_pos += 2;
                }
                j += 1;
            };

            // Create community cards (positions come after hole cards)
            let comm = CommunityCards {
                hand_id,
                flop_1: CARD_NOT_DEALT,
                flop_2: CARD_NOT_DEALT,
                flop_3: CARD_NOT_DEALT,
                turn: CARD_NOT_DEALT,
                river: CARD_NOT_DEALT,
                flop_1_pos: card_pos,
                flop_2_pos: card_pos + 1,
                flop_3_pos: card_pos + 2,
                turn_pos: card_pos + 3,
                river_pos: card_pos + 4,
            };
            world.write_model(@comm);

            // Post blinds
            let mut sb_seat_model: Seat = world.read_model((table_id, sb_seat));
            let sb_amount = if sb_seat_model.chips < table.small_blind {
                sb_seat_model.chips
            } else {
                table.small_blind
            };
            sb_seat_model.chips -= sb_amount;
            world.write_model(@sb_seat_model);

            let mut bb_seat_model: Seat = world.read_model((table_id, bb_seat));
            let bb_amount = if bb_seat_model.chips < table.big_blind {
                bb_seat_model.chips
            } else {
                table.big_blind
            };
            bb_seat_model.chips -= bb_amount;
            world.write_model(@bb_seat_model);

            // Update PlayerHand bets for blinds
            let mut sb_ph: PlayerHand = world.read_model((hand_id, sb_seat));
            sb_ph.bet_this_round = sb_amount;
            sb_ph.total_bet = sb_amount;
            if sb_seat_model.chips == 0 {
                sb_ph.is_all_in = true;
            }
            world.write_model(@sb_ph);

            let mut bb_ph: PlayerHand = world.read_model((hand_id, bb_seat));
            bb_ph.bet_this_round = bb_amount;
            bb_ph.total_bet = bb_amount;
            if bb_seat_model.chips == 0 {
                bb_ph.is_all_in = true;
            }
            world.write_model(@bb_ph);

            // Update hand with pot and current bet
            let mut hand_update: Hand = world.read_model(hand_id);
            hand_update.pot = sb_amount + bb_amount;
            hand_update.current_bet = bb_amount;
            world.write_model(@hand_update);

            // Update table
            table.current_hand_id = hand_id;
            world.write_model(@table);
        }

        fn submit_public_key(
            ref self: ContractState, hand_id: u64, pk_x: felt252, pk_y: felt252,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Setup, 'not setup phase');

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

            // Store the public key
            let mut ph: PlayerHand = world.read_model((hand_id, seat_idx));
            // A-09 NOTE: x==0 is safe as a sentinel because on Grumpkin (y^2 = x^3 - 17),
            // x=0 requires y^2 = -17 which has no solution in the field.
            // Therefore x=0 is provably never a valid public key coordinate.
            assert(ph.public_key_x == 0, 'key already submitted');
            ph.public_key_x = pk_x;
            ph.public_key_y = pk_y;
            world.write_model(@ph);

            // Track key submissions
            hand.keys_submitted += 1;

            // If all keys submitted, transition to shuffling
            if hand.keys_submitted == hand.num_players {
                hand.phase = GamePhase::Shuffling;
                hand.phase_deadline = get_block_timestamp() + SHUFFLE_TIMEOUT;
                hand.shuffle_progress = 0;
            }
            world.write_model(@hand);
        }

        /// Submit the aggregate public key (sum of all player public keys).
        /// ALL players must submit the same aggregate key for consensus.
        fn submit_aggregate_key(
            ref self: ContractState,
            hand_id: u64,
            agg_pk_x: felt252,
            agg_pk_y: felt252,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Shuffling, 'not shuffling phase');
            assert(agg_pk_x != 0 || agg_pk_y != 0, 'invalid agg key');

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

            // Store this player's submitted aggregate key
            // A-09 NOTE: Same x==0 sentinel safety as public_key_x (see above).
            let mut ph: PlayerHand = world.read_model((hand_id, seat_idx));
            assert(ph.submitted_agg_x == 0, 'agg key already submitted');
            ph.submitted_agg_x = agg_pk_x;
            ph.submitted_agg_y = agg_pk_y;
            world.write_model(@ph);

            // Check if all players submitted the same key
            let mut all_agree = true;
            let mut count: u8 = 0;
            let mut j: u8 = 0;
            while j < table.max_players {
                let check_ph: PlayerHand = world.read_model((hand_id, j));
                if check_ph.player != 0.try_into().unwrap() {
                    if check_ph.submitted_agg_x == 0 && check_ph.submitted_agg_y == 0 {
                        all_agree = false;
                        break;
                    }
                    if check_ph.submitted_agg_x != agg_pk_x
                        || check_ph.submitted_agg_y != agg_pk_y {
                        all_agree = false;
                        break;
                    }
                    count += 1;
                }
                j += 1;
            };

            hand.agg_key_confirmations = count;

            if all_agree && count == hand.num_players {
                hand.agg_pub_key_x = agg_pk_x;
                hand.agg_pub_key_y = agg_pk_y;
            }
            world.write_model(@hand);
        }

        /// Submit the hash of the initial deck for consensus.
        /// All players compute the initial deck deterministically from deck_seed
        /// and submit its Poseidon hash. Only when all agree is the full deck accepted.
        fn submit_initial_deck_hash(
            ref self: ContractState, hand_id: u64, deck_hash: felt252,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Shuffling, 'not shuffling phase');
            assert(hand.agg_pub_key_x != 0, 'agg key not finalized');
            assert(deck_hash != 0, 'invalid deck hash');

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

            let mut ph: PlayerHand = world.read_model((hand_id, seat_idx));
            assert(ph.submitted_deck_hash == 0, 'deck hash already submitted');
            ph.submitted_deck_hash = deck_hash;
            world.write_model(@ph);

            // Check consensus
            let mut all_agree = true;
            let mut count: u8 = 0;
            let mut j: u8 = 0;
            while j < table.max_players {
                let check_ph: PlayerHand = world.read_model((hand_id, j));
                if check_ph.player != 0.try_into().unwrap() {
                    if check_ph.submitted_deck_hash == 0 {
                        all_agree = false;
                        break;
                    }
                    if check_ph.submitted_deck_hash != deck_hash {
                        all_agree = false;
                        break;
                    }
                    count += 1;
                }
                j += 1;
            };

            hand.deck_hash_confirmations = count;
            if all_agree && count == hand.num_players {
                hand.initial_deck_hash = deck_hash;
            }
            world.write_model(@hand);
        }

        /// Called to submit the initial encrypted deck before shuffling begins.
        /// Requires: aggregate key finalized + deck hash consensus reached.
        fn submit_initial_deck(ref self: ContractState, hand_id: u64, deck: Array<felt252>) {
            let mut world = self.world_default();

            let hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Shuffling, 'not shuffling phase');
            assert(hand.agg_pub_key_x != 0, 'agg key not finalized');
            assert(hand.initial_deck_hash != 0, 'deck hash not agreed');
            assert(deck.len() == 208, 'invalid deck size');

            // Verify the submitted deck matches the agreed hash
            let actual_hash = poseidon_hash_span(deck.span());
            assert(actual_hash == hand.initial_deck_hash, 'deck does not match hash');

            // Check no deck version 0 exists yet
            let existing: EncryptedDeck = world.read_model((hand_id, 0_u8));
            assert(existing.cards.len() == 0, 'initial deck already set');

            let initial_deck = EncryptedDeck { hand_id, version: 0, cards: deck };
            world.write_model(@initial_deck);
        }
    }

    fn find_next_occupied_seat(
        ref world: dojo::world::WorldStorage,
        table_id: u64,
        current_seat: u8,
        max_players: u8,
    ) -> u8 {
        let mut next = (current_seat + 1) % max_players;
        let mut checked: u8 = 0;
        while checked < max_players {
            let seat: Seat = world.read_model((table_id, next));
            if seat.is_occupied && !seat.is_sitting_out {
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
