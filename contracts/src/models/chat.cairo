use starknet::ContractAddress;
use super::enums::MessageType;

#[derive(Drop, Serde, Debug)]
#[dojo::model]
pub struct ChatMessage {
    #[key]
    pub table_id: u64,
    #[key]
    pub message_id: u64,
    pub sender: ContractAddress,
    pub sender_seat: u8,
    pub message_type: MessageType,
    pub content: felt252,
    pub timestamp: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ChatCounter {
    #[key]
    pub table_id: u64,
    pub next_id: u64,
}
