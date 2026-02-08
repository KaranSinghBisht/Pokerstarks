#[starknet::interface]
pub trait IShuffle<T> {
    fn submit_shuffle(
        ref self: T,
        hand_id: u64,
        new_deck: Array<felt252>,
        proof: Array<felt252>,
    );
}

#[dojo::contract]
pub mod shuffle_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp};
    use super::IShuffle;
    use crate::systems::game_setup::{IVerifierDispatcher, IVerifierDispatcherTrait};
    use crate::models::hand::Hand;
    use crate::models::deck::EncryptedDeck;
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;

    #[abi(embed_v0)]
    impl ShuffleImpl of IShuffle<ContractState> {
        fn submit_shuffle(
            ref self: ContractState,
            hand_id: u64,
            new_deck: Array<felt252>,
            proof: Array<felt252>,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Shuffling, 'not shuffling phase');

            // Verify aggregate key is set (required before first shuffle)
            assert(hand.agg_pub_key_x != 0 || hand.agg_pub_key_y != 0, 'agg key not set');

            // Find the nth occupied seat (shuffle_progress = which shuffler, 0-indexed)
            let table: Table = world.read_model(hand.table_id);
            let expected_seat = find_nth_occupied_seat(
                ref world, hand.table_id, hand.shuffle_progress, table.max_players,
            );
            assert(expected_seat != 255, 'shuffle seat not found');

            let seat: Seat = world.read_model((hand.table_id, expected_seat));
            assert(seat.player == caller, 'not your turn to shuffle');

            // Validate deck size: 52 cards * 4 coordinates = 208 felt252s
            assert(new_deck.len() == 208, 'invalid deck size');

            // Verify proof via Garaga
            let verifier = IVerifierDispatcher {
                contract_address: table.shuffle_verifier,
            };
            let result = verifier.verify_ultra_keccak_zk_honk_proof(proof.span());
            assert(result.is_ok(), 'invalid shuffle proof');

            // Validate key public inputs from the proof
            // The verifier returns public inputs as Span<u256>
            // Layout: [generator_x, generator_y, pub_key_x, pub_key_y, ...]
            let public_inputs = result.unwrap();
            if public_inputs.len() >= 4 {
                // Verify aggregate public key matches on-chain state
                assert(
                    *public_inputs.at(2) == hand.agg_pub_key_x.into(),
                    'proof: wrong agg key x',
                );
                assert(
                    *public_inputs.at(3) == hand.agg_pub_key_y.into(),
                    'proof: wrong agg key y',
                );
            }

            // Store the new deck
            let deck = EncryptedDeck {
                hand_id, version: hand.shuffle_progress + 1, cards: new_deck,
            };
            world.write_model(@deck);

            // Advance shuffle progress
            hand.shuffle_progress += 1;
            hand.phase_deadline = get_block_timestamp() + 60;

            // Check if all players have shuffled
            if hand.shuffle_progress == hand.num_players {
                hand.phase = GamePhase::DealingPreflop;
                hand.phase_deadline = get_block_timestamp() + 30;
            }

            world.write_model(@hand);
        }
    }

    /// Find the nth occupied (non-sitting-out) seat at a table.
    /// Returns 255 if not found.
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

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
