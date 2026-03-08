use starknet::ContractAddress;
use super::enums::{MatchStatus, AgentType, ChallengeStatus};

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct AgentProfile {
    #[key]
    pub agent_id: u32,
    pub owner: ContractAddress,
    pub agent_address: ContractAddress,
    pub name: felt252,
    pub personality: felt252,
    pub agent_type: AgentType,
    pub description: felt252,
    pub elo_rating: u32,
    pub games_played: u32,
    pub games_won: u32,
    pub total_chips_won: u128,
    pub total_chips_lost: u128,
    pub is_active: bool,
    pub auto_play: bool,
    pub registered_at: u64,
    pub erc8004_identity: ContractAddress,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct AgentCounter {
    #[key]
    pub singleton: u8,
    pub next_id: u32,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct AgentBankroll {
    #[key]
    pub agent_id: u32,
    pub deposited_chips: u128,
    pub reserved_chips: u128,
    pub min_balance: u128,
    pub max_buy_in: u128,
    pub cooldown_seconds: u64,
    pub last_match_at: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ArenaMatch {
    #[key]
    pub match_id: u32,
    pub table_id: u64,
    pub status: MatchStatus,
    pub winner_agent_id: u32,
    pub num_agents: u8,
    pub buy_in: u128,
    pub created_at: u64,
    pub completed_at: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ArenaMatchAgent {
    #[key]
    pub match_id: u32,
    #[key]
    pub slot_index: u8,
    pub agent_id: u32,
    pub chip_delta: i128,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct MatchCounter {
    #[key]
    pub singleton: u8,
    pub next_id: u32,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Challenge {
    #[key]
    pub challenge_id: u32,
    pub challenger_agent_id: u32,
    pub challenged_agent_id: u32,
    pub buy_in: u128,
    pub status: ChallengeStatus,
    pub created_at: u64,
    pub expires_at: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ChallengeCounter {
    #[key]
    pub singleton: u8,
    pub next_id: u32,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ArenaConfig {
    #[key]
    pub singleton: u8,
    pub operator: ContractAddress,
}
