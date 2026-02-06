#[starknet::interface]
pub trait IShowdown<T> {
    fn reveal_hand(
        ref self: T,
        hand_id: u64,
        reveal_tokens_x: Array<felt252>,
        reveal_tokens_y: Array<felt252>,
        proofs: Array<Array<felt252>>,
    );
}

#[dojo::contract]
pub mod showdown_system {
    use dojo::model::ModelStorage;
    use starknet::get_caller_address;
    use super::IShowdown;
    use crate::models::hand::{Hand, PlayerHand};
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;

    #[abi(embed_v0)]
    impl ShowdownImpl of IShowdown<ContractState> {
        fn reveal_hand(
            ref self: ContractState,
            hand_id: u64,
            reveal_tokens_x: Array<felt252>,
            reveal_tokens_y: Array<felt252>,
            proofs: Array<Array<felt252>>,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Showdown, 'not showdown phase');

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

            // TODO: Verify proofs and store reveal tokens for own hole cards
            // TODO: With all tokens available, compute card values
            // TODO: Call hand evaluator and determine winner
            // TODO: Transition to settling phase
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
