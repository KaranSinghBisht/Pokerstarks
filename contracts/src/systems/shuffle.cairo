#[starknet::interface]
pub trait IShuffle<T> {
    fn submit_shuffle(
        ref self: T,
        hand_id: u64,
        new_deck: Array<felt252>,
        proof: Array<felt252>,
        verifier_address: starknet::ContractAddress,
    );
}

#[dojo::contract]
pub mod shuffle_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp, ContractAddress};
    use super::IShuffle;
    use crate::systems::game_setup::{IVerifierDispatcher, IVerifierDispatcherTrait};
    use crate::models::hand::Hand;
    use crate::models::deck::EncryptedDeck;
    use crate::models::table::Seat;
    use crate::models::enums::GamePhase;

    #[abi(embed_v0)]
    impl ShuffleImpl of IShuffle<ContractState> {
        fn submit_shuffle(
            ref self: ContractState,
            hand_id: u64,
            new_deck: Array<felt252>,
            proof: Array<felt252>,
            verifier_address: ContractAddress,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Shuffling, 'not shuffling phase');

            // Verify it's this player's turn to shuffle
            let expected_seat = hand.shuffle_progress;
            let seat: Seat = world.read_model((hand.table_id, expected_seat));
            assert(seat.player == caller, 'not your turn to shuffle');

            // Validate deck size: 52 cards * 4 coordinates = 208 felt252s
            assert(new_deck.len() == 208, 'invalid deck size');

            // Verify ZK proof via Garaga verifier contract
            let verifier = IVerifierDispatcher { contract_address: verifier_address };
            let result = verifier.verify_ultra_keccak_zk_honk_proof(proof.span());
            assert(result.is_ok(), 'invalid shuffle proof');

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
