use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct GameToken {
    #[key]
    pub token_id: felt252,
    pub owner: ContractAddress,
    pub table_id: u64,
    pub agent_name: felt252,
    pub hands_played: u32,
    pub score: u64,
    pub game_over: bool,
    pub created_at: u64,
    pub completed_at: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct GameTokenCounter {
    #[key]
    pub singleton: u8,
    pub next_id: felt252,
    pub total_games: u256,
}
