#[starknet::interface]
pub trait IGameSetup<T> {
    fn submit_public_key(ref self: T, hand_id: u64, pk_x: felt252, pk_y: felt252);
}

#[dojo::contract]
pub mod game_setup_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp};
    use super::IGameSetup;
    use crate::models::hand::{Hand, PlayerHand};
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;

    #[abi(embed_v0)]
    impl GameSetupImpl of IGameSetup<ContractState> {
        fn submit_public_key(ref self: ContractState, hand_id: u64, pk_x: felt252, pk_y: felt252) {
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
            assert(ph.public_key_x == 0, 'key already submitted');
            ph.public_key_x = pk_x;
            ph.public_key_y = pk_y;
            world.write_model(@ph);

            // Track key submissions
            hand.keys_submitted += 1;
            world.write_model(@hand);

            // If all keys submitted, compute aggregate key and transition to shuffling
            if hand.keys_submitted == hand.num_players {
                // TODO: compute aggregate public key (EC point addition)
                // For now, store a placeholder
                hand.phase = GamePhase::Shuffling;
                hand.phase_deadline = get_block_timestamp() + 60; // 60s timeout
                world.write_model(@hand);
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
