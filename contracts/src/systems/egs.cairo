/// EGS-compliant game token system.
///
/// Implements the standard `IMinigameTokenData` interface (felt252 token_id)
/// plus game-specific minting / scoring functions.

#[starknet::interface]
pub trait IMinigameTokenData<T> {
    fn score(self: @T, token_id: felt252) -> u64;
    fn game_over(self: @T, token_id: felt252) -> bool;
    fn score_batch(self: @T, token_ids: Span<felt252>) -> Array<u64>;
    fn game_over_batch(self: @T, token_ids: Span<felt252>) -> Array<bool>;
}

#[starknet::interface]
pub trait IPokerstarksEGS<T> {
    fn mint(ref self: T, table_id: u64, agent_name: felt252) -> felt252;
    fn update_score(ref self: T, token_id: felt252, hands_played: u32, score: u64);
    fn complete_session(ref self: T, token_id: felt252, final_score: u64);
    fn game_count(self: @T) -> u256;
    fn game_metadata(self: @T) -> (felt252, felt252, felt252);
}

#[dojo::contract]
pub mod egs_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp};
    use super::{IMinigameTokenData, IPokerstarksEGS};
    use crate::models::egs::{GameToken, GameTokenCounter};

    // ── Events ──

    #[derive(Drop, starknet::Event)]
    struct ScoreUpdate {
        #[key]
        token_id: felt252,
        score: u64,
        hands_played: u32,
    }

    #[derive(Drop, starknet::Event)]
    struct GameOver {
        #[key]
        token_id: felt252,
        final_score: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct TokenMinted {
        #[key]
        token_id: felt252,
        owner: felt252,
        table_id: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        ScoreUpdate: ScoreUpdate,
        GameOver: GameOver,
        TokenMinted: TokenMinted,
    }

    // ── IMinigameTokenData (EGS standard interface) ──

    #[abi(embed_v0)]
    impl MinigameTokenDataImpl of IMinigameTokenData<ContractState> {
        fn score(self: @ContractState, token_id: felt252) -> u64 {
            let world = self.world_default();
            let token: GameToken = world.read_model(token_id);
            token.score
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            let world = self.world_default();
            let token: GameToken = world.read_model(token_id);
            token.game_over
        }

        fn score_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<u64> {
            let world = self.world_default();
            let mut results: Array<u64> = array![];
            let mut i: u32 = 0;
            while i < token_ids.len() {
                let token: GameToken = world.read_model(*token_ids.at(i));
                results.append(token.score);
                i += 1;
            };
            results
        }

        fn game_over_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<bool> {
            let world = self.world_default();
            let mut results: Array<bool> = array![];
            let mut i: u32 = 0;
            while i < token_ids.len() {
                let token: GameToken = world.read_model(*token_ids.at(i));
                results.append(token.game_over);
                i += 1;
            };
            results
        }
    }

    // ── IPokerstarksEGS (game-specific functions) ──

    #[abi(embed_v0)]
    impl PokerstarksEGSImpl of IPokerstarksEGS<ContractState> {
        fn mint(ref self: ContractState, table_id: u64, agent_name: felt252) -> felt252 {
            let mut world = self.world_default();
            let caller = get_caller_address();

            assert(agent_name != 0, 'agent_name cannot be empty');

            let mut counter: GameTokenCounter = world.read_model(0_u8);
            let token_id = counter.next_id;
            counter.next_id += 1;
            counter.total_games += 1;
            world.write_model(@counter);

            let token = GameToken {
                token_id,
                owner: caller,
                table_id,
                agent_name,
                hands_played: 0,
                score: 0,
                game_over: false,
                created_at: get_block_timestamp(),
                completed_at: 0,
            };
            world.write_model(@token);

            self.emit(TokenMinted { token_id, owner: caller.into(), table_id });

            token_id
        }

        fn update_score(
            ref self: ContractState, token_id: felt252, hands_played: u32, score: u64,
        ) {
            let mut world = self.world_default();

            let mut token: GameToken = world.read_model(token_id);
            assert(!token.game_over, 'game already over');
            assert(token.owner == get_caller_address(), 'not token owner');

            token.hands_played = hands_played;
            token.score = score;
            world.write_model(@token);

            self.emit(ScoreUpdate { token_id, score, hands_played });
        }

        fn complete_session(ref self: ContractState, token_id: felt252, final_score: u64) {
            let mut world = self.world_default();

            let mut token: GameToken = world.read_model(token_id);
            assert(!token.game_over, 'game already over');
            assert(token.owner == get_caller_address(), 'not token owner');

            token.score = final_score;
            token.game_over = true;
            token.completed_at = get_block_timestamp();
            world.write_model(@token);

            self.emit(GameOver { token_id, final_score });
        }

        fn game_count(self: @ContractState) -> u256 {
            let world = self.world_default();
            let counter: GameTokenCounter = world.read_model(0_u8);
            counter.total_games
        }

        fn game_metadata(self: @ContractState) -> (felt252, felt252, felt252) {
            ('PokerStarks', 'ZK Poker Arena', 1)
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
