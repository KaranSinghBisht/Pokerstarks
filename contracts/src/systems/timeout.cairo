#[starknet::interface]
pub trait ITimeout<T> {
    fn enforce_timeout(ref self: T, hand_id: u64);
}

#[dojo::contract]
pub mod timeout_system {
    use dojo::model::ModelStorage;
    use starknet::get_block_timestamp;
    use super::ITimeout;
    use crate::models::hand::{Hand, PlayerHand};
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;

    #[abi(embed_v0)]
    impl TimeoutImpl of ITimeout<ContractState> {
        fn enforce_timeout(ref self: ContractState, hand_id: u64) {
            let mut world = self.world_default();

            let mut hand: Hand = world.read_model(hand_id);
            assert(get_block_timestamp() > hand.phase_deadline, 'not timed out yet');

            match hand.phase {
                GamePhase::Shuffling => {
                    // Remove timed-out shuffler, skip to next
                    // TODO: penalize player, restart or skip
                    hand.shuffle_progress += 1;
                    if hand.shuffle_progress == hand.num_players {
                        hand.phase = GamePhase::DealingPreflop;
                    }
                    hand.phase_deadline = get_block_timestamp() + 60;
                },
                GamePhase::DealingPreflop
                | GamePhase::DealingFlop
                | GamePhase::DealingTurn
                | GamePhase::DealingRiver => {
                    // TODO: remove timed-out player from dealing
                    hand.phase_deadline = get_block_timestamp() + 30;
                },
                GamePhase::BettingPreflop
                | GamePhase::BettingFlop
                | GamePhase::BettingTurn
                | GamePhase::BettingRiver => {
                    // Auto-fold the timed-out player
                    let mut ph: PlayerHand = world
                        .read_model((hand_id, hand.current_turn_seat));
                    ph.has_folded = true;
                    ph.has_acted = true;
                    world.write_model(@ph);

                    hand.active_players -= 1;

                    if hand.active_players <= 1 {
                        hand.phase = GamePhase::Settling;
                    } else {
                        // Advance to next player
                        let table: Table = world.read_model(hand.table_id);
                        let max = table.max_players;
                        let mut next = (hand.current_turn_seat + 1) % max;
                        let mut attempts: u8 = 0;
                        while attempts < max {
                            let seat: Seat = world.read_model((hand.table_id, next));
                            if seat.is_occupied {
                                let next_ph: PlayerHand = world.read_model((hand_id, next));
                                if !next_ph.has_folded && !next_ph.is_all_in {
                                    break;
                                }
                            }
                            next = (next + 1) % max;
                            attempts += 1;
                        };
                        hand.current_turn_seat = next;
                        hand.phase_deadline = get_block_timestamp() + 45;
                    }
                },
                GamePhase::Showdown => {
                    // Auto-muck: player loses
                    let mut ph: PlayerHand = world
                        .read_model((hand_id, hand.current_turn_seat));
                    ph.has_folded = true;
                    world.write_model(@ph);
                    hand.active_players -= 1;

                    if hand.active_players <= 1 {
                        hand.phase = GamePhase::Settling;
                    }
                },
                _ => {},
            }

            world.write_model(@hand);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
