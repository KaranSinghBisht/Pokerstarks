#[starknet::interface]
pub trait ISettle<T> {
    fn distribute_pot(ref self: T, hand_id: u64);
}

#[dojo::contract]
pub mod settle_system {
    use dojo::model::ModelStorage;
    use super::ISettle;
    use crate::models::hand::Hand;
    use crate::models::hand::PlayerHand;
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;

    #[abi(embed_v0)]
    impl SettleImpl of ISettle<ContractState> {
        fn distribute_pot(ref self: ContractState, hand_id: u64) {
            let mut world = self.world_default();

            let mut hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Settling, 'not settling phase');

            let table: Table = world.read_model(hand.table_id);

            // Distribute remaining pot (if any)
            // - Fold-win: pot > 0, find the last standing player
            // - Showdown: compute_winner already awarded pot and set it to 0
            if hand.pot > 0 {
                let mut i: u8 = 0;
                while i < table.max_players {
                    let ph: PlayerHand = world.read_model((hand_id, i));
                    if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                        let mut winner_seat: Seat = world.read_model((hand.table_id, i));
                        winner_seat.chips += hand.pot;
                        world.write_model(@winner_seat);
                        break;
                    }
                    i += 1;
                };
            }

            // Reset hand state
            hand.pot = 0;
            hand.phase = GamePhase::Setup; // back to waiting for next hand
            world.write_model(@hand);

            // Reset player ready states for next hand
            let mut j: u8 = 0;
            while j < table.max_players {
                let mut seat: Seat = world.read_model((hand.table_id, j));
                if seat.is_occupied {
                    seat.is_ready = false;
                    world.write_model(@seat);
                }
                j += 1;
            };

            // Advance dealer button
            let mut new_table: Table = world.read_model(hand.table_id);
            new_table.state = crate::models::enums::TableState::Waiting;
            new_table.dealer_seat = (new_table.dealer_seat + 1) % table.max_players;
            world.write_model(@new_table);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
