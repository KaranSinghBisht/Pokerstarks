/// EGS-compliant game token system.
///
/// Implements the standard `IMinigameTokenData` interface (felt252 token_id),
/// the optional `IMinigameDetails` for rich token metadata,
/// SRC5 interface discovery with IMINIGAME_ID registration,
/// plus game-specific minting / scoring functions.

// ── EGS interface IDs (from game_components spec) ──

/// SRC5 interface ID (Starknet's ERC-165 equivalent)
pub const ISRC5_ID: felt252 =
    0x3f918d17e5ee77373b56385708f855659a07f75997f365cf87748628532a055;
/// IMinigame interface ID — required for Denshokan discovery
pub const IMINIGAME_ID: felt252 =
    0x1050f9a792acfa175e26783e365e1b0b38ff3440b960d0ffdfc0ff9d7dc9f2a;

// ── EGS standard: SRC5 interface discovery ──

#[starknet::interface]
pub trait ISRC5<T> {
    fn supports_interface(self: @T, interface_id: felt252) -> bool;
}

// ── EGS core: IMinigameTokenData ──

#[starknet::interface]
pub trait IMinigameTokenData<T> {
    fn score(self: @T, token_id: felt252) -> u64;
    fn game_over(self: @T, token_id: felt252) -> bool;
    fn score_batch(self: @T, token_ids: Span<felt252>) -> Array<u64>;
    fn game_over_batch(self: @T, token_ids: Span<felt252>) -> Array<bool>;
}

// ── EGS struct: GameDetail (name/value pair for game_details) ──

#[derive(Drop, Serde)]
pub struct GameDetail {
    pub name: felt252,
    pub value: felt252,
}

// ── EGS optional: IMinigameDetails with batch variants ──

#[starknet::interface]
pub trait IMinigameDetails<T> {
    fn token_name(self: @T, token_id: felt252) -> ByteArray;
    fn token_description(self: @T, token_id: felt252) -> ByteArray;
    fn game_details(self: @T, token_id: felt252) -> Array<GameDetail>;
    fn token_name_batch(self: @T, token_ids: Span<felt252>) -> Array<ByteArray>;
    fn token_description_batch(self: @T, token_ids: Span<felt252>) -> Array<ByteArray>;
    fn game_details_batch(self: @T, token_ids: Span<felt252>) -> Array<Array<GameDetail>>;
}

// ── Game-specific interface ──

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
    use super::{
        ISRC5, IMinigameTokenData, IMinigameDetails, IPokerstarksEGS,
        GameDetail, ISRC5_ID, IMINIGAME_ID,
    };
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

    // ── ISRC5 (EGS interface discovery) ──

    #[abi(embed_v0)]
    impl SRC5Impl of ISRC5<ContractState> {
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == ISRC5_ID || interface_id == IMINIGAME_ID
        }
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
        fn token_name(self: @ContractState, token_id: felt252) -> ByteArray {
            let world = self.world_default();
            let token: GameToken = world.read_model(token_id);
            felt252_to_bytearray(token.agent_name)
        }

        fn token_description(self: @ContractState, token_id: felt252) -> ByteArray {
            let world = self.world_default();
            let token: GameToken = world.read_model(token_id);
            if token.game_over {
                "Completed PokerStarks Session"
            } else {
                "Active PokerStarks Session"
            }
        }

        fn game_details(self: @ContractState, token_id: felt252) -> Array<GameDetail> {
            let world = self.world_default();
            let token: GameToken = world.read_model(token_id);
            array![
                GameDetail { name: 'agent', value: token.agent_name },
                GameDetail { name: 'table_id', value: token.table_id.into() },
                GameDetail { name: 'hands_played', value: token.hands_played.into() },
                GameDetail { name: 'score', value: token.score.into() },
                GameDetail {
                    name: 'game_over',
                    value: if token.game_over { 1 } else { 0 },
                },
                GameDetail { name: 'created_at', value: token.created_at.into() },
                GameDetail { name: 'completed_at', value: token.completed_at.into() },
            ]
        }

        fn token_name_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<ByteArray> {
            let world = self.world_default();
            let mut results: Array<ByteArray> = array![];
            let mut i: u32 = 0;
            while i < token_ids.len() {
                let token: GameToken = world.read_model(*token_ids.at(i));
                results.append(felt252_to_bytearray(token.agent_name));
                i += 1;
            };
            results
        }

        fn token_description_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<ByteArray> {
            let world = self.world_default();
            let mut results: Array<ByteArray> = array![];
            let mut i: u32 = 0;
            while i < token_ids.len() {
                let token: GameToken = world.read_model(*token_ids.at(i));
                if token.game_over {
                    results.append("Completed PokerStarks Session");
                } else {
                    results.append("Active PokerStarks Session");
                }
                i += 1;
            };
            results
        }

        fn game_details_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<Array<GameDetail>> {
            let world = self.world_default();
            let mut results: Array<Array<GameDetail>> = array![];
            let mut i: u32 = 0;
            while i < token_ids.len() {
                let token: GameToken = world.read_model(*token_ids.at(i));
                results.append(array![
                    GameDetail { name: 'agent', value: token.agent_name },
                    GameDetail { name: 'table_id', value: token.table_id.into() },
                    GameDetail { name: 'hands_played', value: token.hands_played.into() },
                    GameDetail { name: 'score', value: token.score.into() },
                    GameDetail {
                        name: 'game_over',
                        value: if token.game_over { 1 } else { 0 },
                    },
                    GameDetail { name: 'created_at', value: token.created_at.into() },
                    GameDetail { name: 'completed_at', value: token.completed_at.into() },
                ]);
                i += 1;
            };
            results
        }
    }

    // ── IPokerstarksEGS (game-specific functions) ──

    #[abi(embed_v0)]
    impl PokerstarksEGSImpl of IPokerstarksEGS<ContractState> {
        /// Mint a new EGS game token. Restricted to the arena operator to
        /// prevent sybil spam on the leaderboard.
        fn mint(ref self: ContractState, table_id: u64, agent_name: felt252) -> felt252 {
            let mut world = self.world_default();
            let caller = get_caller_address();

            assert(is_operator(ref world, caller), 'not authorized to mint');
            assert(agent_name != 0, 'agent_name cannot be empty');

            let mut counter: GameTokenCounter = world.read_model(0_u8);
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

    // ── Helpers ──

    fn is_operator(ref world: dojo::world::WorldStorage, caller: ContractAddress) -> bool {
        let config: ArenaConfig = world.read_model(0_u8);
        config.operator == caller
    }

    /// Convert a short-string felt252 to ByteArray for EGS spec compliance.
    /// Computes the actual byte length to avoid null-byte padding.
    fn felt252_to_bytearray(value: felt252) -> ByteArray {
        if value == 0 {
            return "";
        }
        // Compute byte length of the short string
        let as_u256: u256 = value.into();
        let mut len: usize = 0;
        let mut v = as_u256;
        while v > 0 {
            len += 1;
            v = v / 256;
        };
        let mut ba: ByteArray = "";
        ba.append_word(value, len);
        ba
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
