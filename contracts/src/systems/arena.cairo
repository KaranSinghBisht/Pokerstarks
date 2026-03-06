#[starknet::interface]
pub trait IArena<T> {
    fn register_agent(
        ref self: T,
        name: felt252,
        agent_address: starknet::ContractAddress,
        personality: felt252,
        agent_type: u8,
        description: felt252,
    ) -> u32;
    fn deactivate_agent(ref self: T, agent_id: u32);
    fn update_agent_config(
        ref self: T,
        agent_id: u32,
        min_balance: u128,
        max_buy_in: u128,
        cooldown_seconds: u64,
        auto_play: bool,
    );
    fn deposit_chips(ref self: T, agent_id: u32, amount: u128);
    fn withdraw_chips(ref self: T, agent_id: u32, amount: u128);
    fn create_arena_match(
        ref self: T, table_id: u64, agent_ids: Span<u32>, buy_in: u128,
    ) -> u32;
    fn record_result(
        ref self: T, match_id: u32, winner_agent_id: u32, chip_deltas: Span<i128>,
    );
    fn challenge_agent(
        ref self: T, challenger_agent_id: u32, challenged_agent_id: u32, buy_in: u128,
    ) -> u32;
    fn accept_challenge(ref self: T, challenge_id: u32);
    fn decline_challenge(ref self: T, challenge_id: u32);
    fn set_erc8004_identity(
        ref self: T, agent_id: u32, identity_address: starknet::ContractAddress,
    );
}

#[dojo::contract]
pub mod arena_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp, ContractAddress};
    use super::IArena;
    use crate::models::arena::{
        AgentProfile, AgentCounter, AgentBankroll, ArenaMatch, ArenaMatchAgent, MatchCounter,
        Challenge, ChallengeCounter,
    };
    use crate::models::enums::{MatchStatus, AgentType, ChallengeStatus};

    const ZERO_ADDR: felt252 = 0;
    const INITIAL_ELO: u32 = 1000;
    const K_FACTOR: u32 = 32;
    const CHALLENGE_EXPIRY: u64 = 3600; // 1 hour

    #[derive(Drop, starknet::Event)]
    struct AgentIdentityLinked {
        #[key]
        agent_id: u32,
        identity_address: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        AgentIdentityLinked: AgentIdentityLinked,
    }

    fn u8_to_agent_type(v: u8) -> AgentType {
        if v == 1 {
            AgentType::Bot
        } else if v == 2 {
            AgentType::Agent
        } else {
            AgentType::Human
        }
    }

    #[abi(embed_v0)]
    impl ArenaImpl of IArena<ContractState> {
        fn register_agent(
            ref self: ContractState,
            name: felt252,
            agent_address: ContractAddress,
            personality: felt252,
            agent_type: u8,
            description: felt252,
        ) -> u32 {
            let mut world = self.world_default();
            let caller = get_caller_address();

            assert(name != 0, 'name cannot be empty');
            assert(
                agent_address != ZERO_ADDR.try_into().unwrap(), 'invalid agent address',
            );

            let mut counter: AgentCounter = world.read_model(0_u8);
            let agent_id = counter.next_id;
            counter.next_id += 1;
            world.write_model(@counter);

            let profile = AgentProfile {
                agent_id,
                owner: caller,
                agent_address,
                name,
                personality,
                agent_type: u8_to_agent_type(agent_type),
                description,
                elo_rating: INITIAL_ELO,
                games_played: 0,
                games_won: 0,
                total_chips_won: 0,
                total_chips_lost: 0,
                is_active: true,
                auto_play: false,
                registered_at: get_block_timestamp(),
                erc8004_identity: ZERO_ADDR.try_into().unwrap(),
            };
            world.write_model(@profile);

            // Initialize bankroll with defaults
            let bankroll = AgentBankroll {
                agent_id,
                deposited_chips: 0,
                reserved_chips: 0,
                min_balance: 0,
                max_buy_in: 0, // 0 = unlimited
                cooldown_seconds: 60,
                last_match_at: 0,
            };
            world.write_model(@bankroll);

            agent_id
        }

        fn deactivate_agent(ref self: ContractState, agent_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut profile: AgentProfile = world.read_model(agent_id);
            assert(profile.owner == caller, 'not agent owner');
            assert(profile.is_active, 'already inactive');

            profile.is_active = false;
            profile.auto_play = false;
            world.write_model(@profile);
        }

        fn update_agent_config(
            ref self: ContractState,
            agent_id: u32,
            min_balance: u128,
            max_buy_in: u128,
            cooldown_seconds: u64,
            auto_play: bool,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut profile: AgentProfile = world.read_model(agent_id);
            assert(profile.owner == caller, 'not agent owner');
            assert(profile.is_active, 'agent not active');

            profile.auto_play = auto_play;
            world.write_model(@profile);

            let mut bankroll: AgentBankroll = world.read_model(agent_id);
            bankroll.min_balance = min_balance;
            bankroll.max_buy_in = max_buy_in;
            bankroll.cooldown_seconds = cooldown_seconds;
            world.write_model(@bankroll);
        }

        fn deposit_chips(ref self: ContractState, agent_id: u32, amount: u128) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let profile: AgentProfile = world.read_model(agent_id);
            assert(profile.owner == caller, 'not agent owner');
            assert(amount > 0, 'amount must be positive');

            let mut bankroll: AgentBankroll = world.read_model(agent_id);
            bankroll.deposited_chips += amount;
            world.write_model(@bankroll);
        }

        fn withdraw_chips(ref self: ContractState, agent_id: u32, amount: u128) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let profile: AgentProfile = world.read_model(agent_id);
            assert(profile.owner == caller, 'not agent owner');
            assert(amount > 0, 'amount must be positive');

            let mut bankroll: AgentBankroll = world.read_model(agent_id);
            let available = bankroll.deposited_chips - bankroll.reserved_chips;
            assert(amount <= available, 'insufficient available chips');

            bankroll.deposited_chips -= amount;
            world.write_model(@bankroll);
        }

        fn create_arena_match(
            ref self: ContractState, table_id: u64, agent_ids: Span<u32>, buy_in: u128,
        ) -> u32 {
            let mut world = self.world_default();
            let num_agents = agent_ids.len();
            assert(num_agents >= 2, 'need at least 2 agents');
            assert(num_agents <= 6, 'max 6 agents');

            let now = get_block_timestamp();

            // Check for duplicate agent IDs
            let mut d: u32 = 0;
            while d < num_agents {
                let mut e: u32 = d + 1;
                while e < num_agents {
                    assert(*agent_ids.at(d) != *agent_ids.at(e), 'duplicate agent id');
                    e += 1;
                };
                d += 1;
            };

            // Verify all agents exist, are active, and have sufficient bankroll
            let mut i: u32 = 0;
            while i < num_agents {
                let agent_id = *agent_ids.at(i);
                let profile: AgentProfile = world.read_model(agent_id);
                assert(profile.is_active, 'agent not active');

                let bankroll: AgentBankroll = world.read_model(agent_id);
                let available = bankroll.deposited_chips - bankroll.reserved_chips;
                assert(available >= buy_in, 'insufficient bankroll');

                // Check max_buy_in cap (0 = unlimited)
                if bankroll.max_buy_in > 0 {
                    assert(buy_in <= bankroll.max_buy_in, 'exceeds max buy-in');
                }

                // Check cooldown
                if bankroll.last_match_at > 0 {
                    assert(
                        now >= bankroll.last_match_at + bankroll.cooldown_seconds,
                        'cooldown not elapsed',
                    );
                }

                i += 1;
            };

            // Reserve chips for each agent
            let mut j: u32 = 0;
            while j < num_agents {
                let agent_id = *agent_ids.at(j);
                let mut bankroll: AgentBankroll = world.read_model(agent_id);
                bankroll.reserved_chips += buy_in;
                bankroll.last_match_at = now;
                world.write_model(@bankroll);
                j += 1;
            };

            let mut match_counter: MatchCounter = world.read_model(0_u8);
            let match_id = match_counter.next_id;
            match_counter.next_id += 1;
            world.write_model(@match_counter);

            let arena_match = ArenaMatch {
                match_id,
                table_id,
                status: MatchStatus::InProgress,
                winner_agent_id: 0,
                num_agents: num_agents.try_into().unwrap(),
                buy_in,
                created_at: now,
                completed_at: 0,
            };
            world.write_model(@arena_match);

            // Create match agent entries
            let mut k: u32 = 0;
            while k < num_agents {
                let match_agent = ArenaMatchAgent {
                    match_id,
                    slot_index: k.try_into().unwrap(),
                    agent_id: *agent_ids.at(k),
                    chip_delta: 0,
                };
                world.write_model(@match_agent);
                k += 1;
            };

            match_id
        }

        fn record_result(
            ref self: ContractState,
            match_id: u32,
            winner_agent_id: u32,
            chip_deltas: Span<i128>,
        ) {
            let mut world = self.world_default();

            let mut arena_match: ArenaMatch = world.read_model(match_id);
            assert(arena_match.status == MatchStatus::InProgress, 'match not in progress');
            assert(
                chip_deltas.len() == arena_match.num_agents.into(), 'wrong chip_deltas length',
            );

            // Validate winner is actually in the match
            let num: u8 = arena_match.num_agents;
            let mut winner_found = false;
            let mut v: u8 = 0;
            while v < num {
                let check_ma: ArenaMatchAgent = world.read_model((match_id, v));
                if check_ma.agent_id == winner_agent_id {
                    winner_found = true;
                }
                v += 1;
            };
            assert(winner_found, 'winner not in match');

            // Update match
            arena_match.status = MatchStatus::Complete;
            arena_match.winner_agent_id = winner_agent_id;
            arena_match.completed_at = get_block_timestamp();
            world.write_model(@arena_match);

            let buy_in = arena_match.buy_in;

            // Update each agent's stats, chip deltas, and bankroll
            let mut i: u8 = 0;
            while i < num {
                let mut match_agent: ArenaMatchAgent = world.read_model((match_id, i));
                let delta = *chip_deltas.at(i.into());
                match_agent.chip_delta = delta;
                world.write_model(@match_agent);

                let mut profile: AgentProfile = world.read_model(match_agent.agent_id);
                profile.games_played += 1;

                if match_agent.agent_id == winner_agent_id {
                    profile.games_won += 1;
                }

                if delta > 0 {
                    profile.total_chips_won += delta.try_into().unwrap();
                } else if delta < 0 {
                    let abs_delta: u128 = (-delta).try_into().unwrap();
                    profile.total_chips_lost += abs_delta;
                }

                world.write_model(@profile);

                // Settle bankroll: release reserved, apply delta
                let mut bankroll: AgentBankroll = world.read_model(match_agent.agent_id);
                bankroll.reserved_chips -= buy_in;
                if delta > 0 {
                    bankroll.deposited_chips += delta.try_into().unwrap();
                } else if delta < 0 {
                    let abs_delta: u128 = (-delta).try_into().unwrap();
                    if bankroll.deposited_chips > abs_delta {
                        bankroll.deposited_chips -= abs_delta;
                    } else {
                        bankroll.deposited_chips = 0;
                    }
                }

                // Auto-pause if below min_balance
                if bankroll.min_balance > 0
                    && bankroll.deposited_chips < bankroll.min_balance {
                    let mut p: AgentProfile = world.read_model(match_agent.agent_id);
                    p.auto_play = false;
                    world.write_model(@p);
                }

                world.write_model(@bankroll);
                i += 1;
            };

            // Update Elo ratings for winner vs each loser
            let mut k: u8 = 0;
            while k < num {
                let ma: ArenaMatchAgent = world.read_model((match_id, k));
                if ma.agent_id != winner_agent_id {
                    let wp: AgentProfile = world.read_model(winner_agent_id);
                    let lp: AgentProfile = world.read_model(ma.agent_id);

                    let (new_winner_elo, new_loser_elo) = calculate_elo(
                        wp.elo_rating, lp.elo_rating,
                    );

                    let mut wp_mut: AgentProfile = world.read_model(winner_agent_id);
                    wp_mut.elo_rating = new_winner_elo;
                    world.write_model(@wp_mut);

                    let mut lp_mut: AgentProfile = world.read_model(ma.agent_id);
                    lp_mut.elo_rating = new_loser_elo;
                    world.write_model(@lp_mut);
                }
                k += 1;
            };
        }

        fn challenge_agent(
            ref self: ContractState,
            challenger_agent_id: u32,
            challenged_agent_id: u32,
            buy_in: u128,
        ) -> u32 {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let now = get_block_timestamp();

            assert(challenger_agent_id != challenged_agent_id, 'cannot challenge self');

            let challenger: AgentProfile = world.read_model(challenger_agent_id);
            assert(challenger.owner == caller, 'not challenger owner');
            assert(challenger.is_active, 'challenger not active');

            let challenged: AgentProfile = world.read_model(challenged_agent_id);
            assert(challenged.is_active, 'challenged not active');

            // Check challenger has enough chips
            let bankroll: AgentBankroll = world.read_model(challenger_agent_id);
            let available = bankroll.deposited_chips - bankroll.reserved_chips;
            assert(available >= buy_in, 'insufficient bankroll');

            let mut counter: ChallengeCounter = world.read_model(0_u8);
            let challenge_id = counter.next_id;
            counter.next_id += 1;
            world.write_model(@counter);

            let challenge = Challenge {
                challenge_id,
                challenger_agent_id,
                challenged_agent_id,
                buy_in,
                status: ChallengeStatus::Pending,
                created_at: now,
                expires_at: now + CHALLENGE_EXPIRY,
            };
            world.write_model(@challenge);

            challenge_id
        }

        fn accept_challenge(ref self: ContractState, challenge_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let now = get_block_timestamp();

            let mut challenge: Challenge = world.read_model(challenge_id);
            assert(challenge.status == ChallengeStatus::Pending, 'not pending');
            assert(now < challenge.expires_at, 'challenge expired');

            let challenged: AgentProfile = world.read_model(challenge.challenged_agent_id);
            assert(challenged.owner == caller, 'not challenged owner');

            // Check challenged has enough chips
            let bankroll: AgentBankroll = world.read_model(challenge.challenged_agent_id);
            let available = bankroll.deposited_chips - bankroll.reserved_chips;
            assert(available >= challenge.buy_in, 'insufficient bankroll');

            challenge.status = ChallengeStatus::Accepted;
            world.write_model(@challenge);
        }

        fn decline_challenge(ref self: ContractState, challenge_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut challenge: Challenge = world.read_model(challenge_id);
            assert(challenge.status == ChallengeStatus::Pending, 'not pending');

            let challenged: AgentProfile = world.read_model(challenge.challenged_agent_id);
            assert(challenged.owner == caller, 'not challenged owner');

            challenge.status = ChallengeStatus::Declined;
            world.write_model(@challenge);
        }

        fn set_erc8004_identity(
            ref self: ContractState, agent_id: u32, identity_address: ContractAddress,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut profile: AgentProfile = world.read_model(agent_id);
            assert(profile.owner == caller, 'not agent owner');

            profile.erc8004_identity = identity_address;
            world.write_model(@profile);

            self.emit(AgentIdentityLinked { agent_id, identity_address });
        }
    }

    /// Integer Elo calculation.
    /// Uses linear approximation: expected = 500 + (opponent_elo - my_elo) * 500 / 400
    /// Clamped to [50, 950] to avoid extreme swings.
    fn calculate_elo(winner_elo: u32, loser_elo: u32) -> (u32, u32) {
        let diff: i64 = loser_elo.into() - winner_elo.into();
        let expected_winner_raw: i64 = 500 + diff * 500 / 400;
        let expected_winner: u32 = clamp_u32(expected_winner_raw, 50, 950);

        let gain: u32 = K_FACTOR * (1000 - expected_winner) / 1000;
        let loss: u32 = K_FACTOR * expected_winner / 1000;

        let new_winner = if gain > 0 {
            winner_elo + gain
        } else {
            winner_elo + 1
        };
        let new_loser = if loser_elo > loss {
            loser_elo - loss
        } else {
            1
        };

        (new_winner, new_loser)
    }

    fn clamp_u32(val: i64, min: u32, max: u32) -> u32 {
        if val < min.into() {
            min
        } else if val > max.into() {
            max
        } else {
            val.try_into().unwrap()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
