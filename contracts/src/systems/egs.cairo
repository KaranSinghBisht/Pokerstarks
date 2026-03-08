/// EGS-compliant game token system.
///
/// Implements the standard `IMinigameTokenData` interface (felt252 token_id),
/// the optional `IMinigameDetails` for rich token metadata,
/// plus game-specific minting / scoring functions.

#[starknet::interface]
pub trait IMinigameTokenData<T> {
    fn score(self: @T, token_id: felt252) -> u64;
    fn game_over(self: @T, token_id: felt252) -> bool;
    fn score_batch(self: @T, token_ids: Span<felt252>) -> Array<u64>;
    fn game_over_batch(self: @T, token_ids: Span<felt252>) -> Array<bool>;
}

/// EGS optional extension: rich token metadata.
/// Returns structured name/value pairs describing game sessions.
#[starknet::interface]
pub trait IMinigameDetails<T> {
    fn token_name(self: @T, token_id: felt252) -> felt252;
    fn token_description(self: @T, token_id: felt252) -> felt252;
    fn game_details(self: @T, token_id: felt252) -> Array<(felt252, felt252)>;
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
    use starknet::{get_caller_address, get_block_timestamp, ContractAddress};
    use super::{IMinigameTokenData, IMinigameDetails, IPokerstarksEGS};
    use crate::models::egs::{GameToken, GameTokenCounter};
    use crate::models::arena::ArenaConfig;

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
        owner: ContractAddress,
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

    // ── IMinigameDetails (EGS optional extension) ──

    #[abi(embed_v0)]
    impl MinigameDetailsImpl of IMinigameDetails<ContractState> {
        fn token_name(self: @ContractState, token_id: felt252) -> felt252 {
            let world = self.world_default();
            let token: GameToken = world.read_model(token_id);
            token.agent_name
        }

        fn token_description(self: @ContractState, token_id: felt252) -> felt252 {
            let world = self.world_default();
            let token: GameToken = world.read_model(token_id);
            if token.game_over {
                'Completed Session'
            } else {
                'Active Session'
            }
        }

        fn game_details(self: @ContractState, token_id: felt252) -> Array<(felt252, felt252)> {
            let world = self.world_default();
            let token: GameToken = world.read_model(token_id);
            array![
                ('agent', token.agent_name),
                ('table_id', token.table_id.into()),
                ('hands_played', token.hands_played.into()),
                ('score', token.score.into()),
                ('game_over', if token.game_over { 1 } else { 0 }),
                ('created_at', token.created_at.into()),
                ('completed_at', token.completed_at.into()),
            ]
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
            // M3 FIX: Ensure token IDs start at 1 (0 is often used as null)
            if counter.next_id == 0 {
                counter.next_id = 1;
            }
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

            self.emit(TokenMinted { token_id, owner: caller, table_id });

            token_id
        }

        fn update_score(
            ref self: ContractState, token_id: felt252, hands_played: u32, score: u64,
        ) {
            let mut world = self.world_default();

            let mut token: GameToken = world.read_model(token_id);
            assert(!token.game_over, 'game already over');
            // C2 FIX: Allow token owner OR arena operator
            let caller = get_caller_address();
            assert(
                token.owner == caller || is_operator(ref world, caller), 'not authorized',
            );

            token.hands_played = hands_played;
            token.score = score;
            world.write_model(@token);

            self.emit(ScoreUpdate { token_id, score, hands_played });
        }

        fn complete_session(ref self: ContractState, token_id: felt252, final_score: u64) {
            let mut world = self.world_default();

            let mut token: GameToken = world.read_model(token_id);
            assert(!token.game_over, 'game already over');
            // C2 FIX: Allow token owner OR arena operator
            let caller = get_caller_address();
            assert(
                token.owner == caller || is_operator(ref world, caller), 'not authorized',
            );

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

    fn is_operator(ref world: dojo::world::WorldStorage, caller: ContractAddress) -> bool {
        let config: ArenaConfig = world.read_model(0_u8);
        config.operator == caller
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
