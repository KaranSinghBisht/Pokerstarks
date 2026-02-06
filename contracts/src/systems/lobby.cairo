#[starknet::interface]
pub trait ILobby<T> {
    fn create_table(
        ref self: T,
        max_players: u8,
        small_blind: u128,
        big_blind: u128,
        min_buy_in: u128,
        max_buy_in: u128,
    ) -> u64;
    fn join_table(ref self: T, table_id: u64, buy_in: u128, preferred_seat: u8);
    fn leave_table(ref self: T, table_id: u64);
    fn set_ready(ref self: T, table_id: u64);
}

#[dojo::contract]
pub mod lobby_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp};
    use super::ILobby;
    use crate::models::table::{Table, Seat, TableCounter};
    use crate::models::enums::TableState;

    #[abi(embed_v0)]
    impl LobbyImpl of ILobby<ContractState> {
        fn create_table(
            ref self: ContractState,
            max_players: u8,
            small_blind: u128,
            big_blind: u128,
            min_buy_in: u128,
            max_buy_in: u128,
        ) -> u64 {
            let mut world = self.world_default();
            let caller = get_caller_address();

            // Validate params
            assert(max_players >= 2 && max_players <= 6, 'max_players must be 2-6');
            assert(big_blind > 0, 'big_blind must be > 0');
            assert(small_blind > 0 && small_blind <= big_blind, 'invalid blinds');
            assert(min_buy_in >= big_blind * 10, 'min_buy_in too low');
            assert(max_buy_in >= min_buy_in, 'max < min buy_in');

            // Get next table ID
            let mut counter: TableCounter = world.read_model(0_u8);
            let table_id = counter.next_id;
            counter.next_id += 1;
            world.write_model(@counter);

            // Create table
            let table = Table {
                table_id,
                creator: caller,
                max_players,
                small_blind,
                big_blind,
                min_buy_in,
                max_buy_in,
                state: TableState::Waiting,
                current_hand_id: 0,
                dealer_seat: 0,
                player_count: 0,
                created_at: get_block_timestamp(),
            };
            world.write_model(@table);

            table_id
        }

        fn join_table(ref self: ContractState, table_id: u64, buy_in: u128, preferred_seat: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut table: Table = world.read_model(table_id);
            assert(table.state == TableState::Waiting, 'table not waiting');
            assert(buy_in >= table.min_buy_in && buy_in <= table.max_buy_in, 'invalid buy_in');
            assert(preferred_seat < table.max_players, 'invalid seat');

            // Check seat is empty
            let seat: Seat = world.read_model((table_id, preferred_seat));
            assert(!seat.is_occupied, 'seat taken');

            // Seat the player
            let new_seat = Seat {
                table_id,
                seat_index: preferred_seat,
                player: caller,
                chips: buy_in,
                is_occupied: true,
                is_ready: false,
                is_sitting_out: false,
            };
            world.write_model(@new_seat);

            table.player_count += 1;
            world.write_model(@table);
        }

        fn leave_table(ref self: ContractState, table_id: u64) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut table: Table = world.read_model(table_id);
            assert(table.state == TableState::Waiting, 'cannot leave during hand');

            // Find the player's seat
            let mut found = false;
            let mut i: u8 = 0;
            while i < table.max_players {
                let seat: Seat = world.read_model((table_id, i));
                if seat.is_occupied && seat.player == caller {
                    // Clear the seat
                    let empty_seat = Seat {
                        table_id,
                        seat_index: i,
                        player: 0.try_into().unwrap(),
                        chips: 0,
                        is_occupied: false,
                        is_ready: false,
                        is_sitting_out: false,
                    };
                    world.write_model(@empty_seat);
                    found = true;
                    break;
                }
                i += 1;
            };
            assert(found, 'player not at table');

            table.player_count -= 1;
            world.write_model(@table);
        }

        fn set_ready(ref self: ContractState, table_id: u64) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let table: Table = world.read_model(table_id);
            assert(table.state == TableState::Waiting, 'table not waiting');

            // Find player's seat and mark ready
            let mut found = false;
            let mut i: u8 = 0;
            while i < table.max_players {
                let mut seat: Seat = world.read_model((table_id, i));
                if seat.is_occupied && seat.player == caller {
                    seat.is_ready = true;
                    world.write_model(@seat);
                    found = true;
                    break;
                }
                i += 1;
            };
            assert(found, 'player not at table');

            // Check if all seated players are ready and count >= 2
            let mut ready_count: u8 = 0;
            let mut all_ready = true;
            let mut j: u8 = 0;
            while j < table.max_players {
                let seat: Seat = world.read_model((table_id, j));
                if seat.is_occupied {
                    if !seat.is_ready {
                        all_ready = false;
                    }
                    ready_count += 1;
                }
                j += 1;
            };

            if all_ready && ready_count >= 2 {
                // Mark table as in progress — client then calls
                // game_setup_system::start_hand(table_id) to begin the hand
                let mut table: Table = world.read_model(table_id);
                table.state = TableState::InProgress;
                world.write_model(@table);
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
