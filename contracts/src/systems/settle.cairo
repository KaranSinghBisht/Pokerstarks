#[starknet::interface]
pub trait IERC20<T> {
    fn transfer(ref self: T, recipient: starknet::ContractAddress, amount: u256) -> bool;
}

#[starknet::interface]
pub trait ISettle<T> {
    fn distribute_pot(ref self: T, hand_id: u64);
}

#[dojo::contract]
pub mod settle_system {
    use dojo::model::ModelStorage;
    use super::{ISettle, IERC20Dispatcher, IERC20DispatcherTrait};
    use crate::models::hand::Hand;
    use crate::models::hand::PlayerHand;
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;

    const ZERO_ADDR: felt252 = 0;

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
                // Deduct rake on fold-wins too
                if table.rake_bps > 0 {
                    let rake_amount = hand.pot * table.rake_bps.into() / 10000;
                    let rake = if rake_amount > table.rake_cap {
                        table.rake_cap
                    } else {
                        rake_amount
                    };
                    hand.pot -= rake;

                    if table.token_address != ZERO_ADDR.try_into().unwrap()
                        && table.rake_recipient != ZERO_ADDR.try_into().unwrap() {
                        let token = IERC20Dispatcher {
                            contract_address: table.token_address,
                        };
                        token.transfer(table.rake_recipient, rake.into());
                    }
                }

                let mut i: u8 = 0;
                while i < table.max_players {
                    let ph: PlayerHand = world.read_model((hand_id, i));
                    if ph.player != ZERO_ADDR.try_into().unwrap() && !ph.has_folded {
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

            // Advance dealer button (skip empty seats)
            let mut new_table: Table = world.read_model(hand.table_id);
            new_table.state = crate::models::enums::TableState::Waiting;
            let mut next_dealer = (new_table.dealer_seat + 1) % table.max_players;
            let mut checked: u8 = 0;
            while checked < table.max_players {
                let s: Seat = world.read_model((hand.table_id, next_dealer));
                if s.is_occupied {
                    break;
                }
                next_dealer = (next_dealer + 1) % table.max_players;
                checked += 1;
            };
            new_table.dealer_seat = next_dealer;
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
