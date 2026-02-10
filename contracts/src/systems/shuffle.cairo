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
    use core::poseidon::poseidon_hash_span;
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

            // Validate public inputs from the proof
            // Layout: [gen_x, gen_y, pk_x, pk_y, input_c1_x[52], input_c1_y[52],
            //          input_c2_x[52], input_c2_y[52], output_c1_x[52], output_c1_y[52],
            //          output_c2_x[52], output_c2_y[52]]  = 420 total
            let public_inputs = result.unwrap();
            assert(public_inputs.len() >= 420, 'insufficient proof inputs');

            // A-03 FIX: Assert proof's generator matches canonical Grumpkin generator.
            // Without this, a prover could satisfy circuit constraints under an
            // arbitrary generator, producing a valid proof for an invalid shuffle.
            use crate::utils::constants::{GEN_X, GEN_Y};
            assert(
                *public_inputs.at(0) == GEN_X.into(), 'proof: wrong generator x',
            );
            assert(
                *public_inputs.at(1) == GEN_Y.into(), 'proof: wrong generator y',
            );

            // Verify aggregate public key matches on-chain state
            assert(
                *public_inputs.at(2) == hand.agg_pub_key_x.into(),
                'proof: wrong agg key x',
            );
            assert(
                *public_inputs.at(3) == hand.agg_pub_key_y.into(),
                'proof: wrong agg key y',
            );

            // F-01 FIX: Bind proof's input deck to on-chain stored deck.
            // Read the previous deck version (before this shuffle).
            let prev_deck: EncryptedDeck = world.read_model((hand_id, hand.shuffle_progress));
            assert(prev_deck.cards.len() == 208, 'previous deck missing');

            // Reorder proof input deck (array-of-fields layout) to interleaved,
            // then Poseidon-hash and compare against stored deck hash.
            let proof_input_deck = reorder_proof_deck_to_interleaved(public_inputs, 4);
            let stored_hash = poseidon_hash_span(prev_deck.cards.span());
            let proof_in_hash = poseidon_hash_span(proof_input_deck.span());
            assert(stored_hash == proof_in_hash, 'input deck mismatch');

            // F-01 FIX: Bind proof's output deck to submitted new_deck.
            let proof_output_deck = reorder_proof_deck_to_interleaved(public_inputs, 212);
            let new_deck_hash = poseidon_hash_span(new_deck.span());
            let proof_out_hash = poseidon_hash_span(proof_output_deck.span());
            assert(new_deck_hash == proof_out_hash, 'output deck mismatch');

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

    /// Reorder proof public inputs from array-of-fields layout to interleaved layout.
    /// Proof layout at `offset`: c1_x[52], c1_y[52], c2_x[52], c2_y[52].
    /// Output: [c1_x_0, c1_y_0, c2_x_0, c2_y_0, c1_x_1, ...] (208 felt252s).
    fn reorder_proof_deck_to_interleaved(
        public_inputs: Span<u256>, offset: u32,
    ) -> Array<felt252> {
        let mut deck: Array<felt252> = array![];
        let mut i: u32 = 0;
        while i < 52 {
            deck.append((*public_inputs.at(offset + i)).try_into().unwrap());
            deck.append((*public_inputs.at(offset + 52 + i)).try_into().unwrap());
            deck.append((*public_inputs.at(offset + 104 + i)).try_into().unwrap());
            deck.append((*public_inputs.at(offset + 156 + i)).try_into().unwrap());
            i += 1;
        };
        deck
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
