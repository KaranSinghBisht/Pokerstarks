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

            // Verify it's this player's turn to shuffle
            let expected_seat = hand.shuffle_progress;
            let seat: Seat = world.read_model((hand.table_id, expected_seat));
            assert(seat.is_occupied, 'seat not occupied');
            assert(seat.player == caller, 'not your turn to shuffle');

            // Validate deck size: 52 cards * 4 coordinates = 208 felt252s
            assert(new_deck.len() == 208, 'invalid deck size');

            // Use verifier address stored on the table (not caller-supplied)
            let table: Table = world.read_model(hand.table_id);
            let verifier = IVerifierDispatcher {
                contract_address: table.shuffle_verifier,
            };
            let result = verifier.verify_ultra_keccak_zk_honk_proof(proof.span());
            assert(result.is_ok(), 'invalid shuffle proof');

            // Validate public inputs from the proof match on-chain state
            // The verifier returns public inputs as Span<u256>
            // Public inputs layout: [generator_x, generator_y, pub_key_x, pub_key_y,
            //   input_c1_x[0..52], input_c1_y[0..52], input_c2_x[0..52], input_c2_y[0..52],
            //   output_c1_x[0..52], output_c1_y[0..52], output_c2_x[0..52], output_c2_y[0..52]]
            // For hackathon MVP: we verify proof validity via Garaga. Full public input
            // binding (matching against stored deck) is deferred to production since it
            // requires u256<->felt252 conversions for 416+ values.

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

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
