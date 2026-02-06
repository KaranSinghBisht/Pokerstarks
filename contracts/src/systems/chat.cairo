#[starknet::interface]
pub trait IChat<T> {
    fn send_message(ref self: T, table_id: u64, content: felt252);
    fn send_emote(ref self: T, table_id: u64, emote_id: felt252);
}

#[dojo::contract]
pub mod chat_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp};
    use super::IChat;
    use crate::models::chat::{ChatMessage, ChatCounter};
    use crate::models::table::{Table, Seat};
    use crate::models::enums::MessageType;

    #[abi(embed_v0)]
    impl ChatImpl of IChat<ContractState> {
        fn send_message(ref self: ContractState, table_id: u64, content: felt252) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            // Find caller's seat at the table
            let table: Table = world.read_model(table_id);
            let mut seat_idx: u8 = 255;
            let mut i: u8 = 0;
            while i < table.max_players {
                let seat: Seat = world.read_model((table_id, i));
                if seat.is_occupied && seat.player == caller {
                    seat_idx = i;
                    break;
                }
                i += 1;
            };
            assert(seat_idx != 255, 'player not at table');

            // Get next message ID
            let mut counter: ChatCounter = world.read_model(table_id);
            let msg_id = counter.next_id;
            counter.next_id += 1;
            world.write_model(@counter);

            let message = ChatMessage {
                table_id,
                message_id: msg_id,
                sender: caller,
                sender_seat: seat_idx,
                message_type: MessageType::Text,
                content,
                timestamp: get_block_timestamp(),
            };
            world.write_model(@message);
        }

        fn send_emote(ref self: ContractState, table_id: u64, emote_id: felt252) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let table: Table = world.read_model(table_id);
            let mut seat_idx: u8 = 255;
            let mut i: u8 = 0;
            while i < table.max_players {
                let seat: Seat = world.read_model((table_id, i));
                if seat.is_occupied && seat.player == caller {
                    seat_idx = i;
                    break;
                }
                i += 1;
            };
            assert(seat_idx != 255, 'player not at table');

            let mut counter: ChatCounter = world.read_model(table_id);
            let msg_id = counter.next_id;
            counter.next_id += 1;
            world.write_model(@counter);

            let message = ChatMessage {
                table_id,
                message_id: msg_id,
                sender: caller,
                sender_seat: seat_idx,
                message_type: MessageType::Emote,
                content: emote_id,
                timestamp: get_block_timestamp(),
            };
            world.write_model(@message);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
