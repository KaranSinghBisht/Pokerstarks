use crate::models::enums::PlayerAction;

#[starknet::interface]
pub trait IBetting<T> {
    fn player_action(ref self: T, hand_id: u64, action: PlayerAction, amount: u128);
}

#[dojo::contract]
pub mod betting_system {
    use dojo::model::ModelStorage;
    use starknet::{get_caller_address, get_block_timestamp};
    use super::IBetting;
    use crate::models::hand::{Hand, PlayerHand};
    use crate::models::table::{Table, Seat};
    use crate::models::enums::{GamePhase, PlayerAction};

    const ZERO_ADDR: felt252 = 0;

    #[abi(embed_v0)]
    impl BettingImpl of IBetting<ContractState> {
        fn player_action(
            ref self: ContractState, hand_id: u64, action: PlayerAction, amount: u128,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut hand: Hand = world.read_model(hand_id);

            // Verify we're in a betting phase
            assert(
                hand.phase == GamePhase::BettingPreflop
                    || hand.phase == GamePhase::BettingFlop
                    || hand.phase == GamePhase::BettingTurn
                    || hand.phase == GamePhase::BettingRiver,
                'not betting phase',
            );

            // Verify it's caller's turn
            let table: Table = world.read_model(hand.table_id);
            let seat: Seat = world.read_model((hand.table_id, hand.current_turn_seat));
            assert(seat.player == caller, 'not your turn');

            let mut ph: PlayerHand = world.read_model((hand_id, hand.current_turn_seat));
            assert(!ph.has_folded, 'already folded');

            match action {
                PlayerAction::Fold => {
                    ph.has_folded = true;
                    hand.active_players -= 1;
                },
                PlayerAction::Check => {
                    assert(hand.current_bet == ph.bet_this_round, 'cannot check');
                },
                PlayerAction::Call => {
                    let call_amount = hand.current_bet - ph.bet_this_round;
                    assert(call_amount > 0, 'nothing to call');
                    ph.bet_this_round += call_amount;
                    ph.total_bet += call_amount;
                    hand.pot += call_amount;

                    let mut player_seat: Seat = world
                        .read_model((hand.table_id, hand.current_turn_seat));
                    assert(player_seat.chips >= call_amount, 'not enough chips');
                    player_seat.chips -= call_amount;
                    world.write_model(@player_seat);
                },
                PlayerAction::Bet => {
                    assert(hand.current_bet == 0, 'use raise instead');
                    ph.bet_this_round = amount;
                    ph.total_bet += amount;
                    hand.current_bet = amount;
                    hand.pot += amount;

                    let mut player_seat: Seat = world
                        .read_model((hand.table_id, hand.current_turn_seat));
                    assert(player_seat.chips >= amount, 'not enough chips');
                    player_seat.chips -= amount;
                    world.write_model(@player_seat);
                },
                PlayerAction::Raise => {
                    assert(amount > hand.current_bet, 'raise must be higher');
                    let raise_amount = amount - ph.bet_this_round;
                    ph.bet_this_round = amount;
                    ph.total_bet += raise_amount;
                    hand.current_bet = amount;
                    hand.pot += raise_amount;

                    let mut player_seat: Seat = world
                        .read_model((hand.table_id, hand.current_turn_seat));
                    assert(player_seat.chips >= raise_amount, 'not enough chips');
                    player_seat.chips -= raise_amount;
                    world.write_model(@player_seat);

                    // Reset has_acted for other players
                    let mut k: u8 = 0;
                    while k < table.max_players {
                        if k != hand.current_turn_seat {
                            let mut other_ph: PlayerHand = world.read_model((hand_id, k));
                            if other_ph.player != ZERO_ADDR.try_into().unwrap()
                                && !other_ph.has_folded
                                && !other_ph.is_all_in {
                                other_ph.has_acted = false;
                                world.write_model(@other_ph);
                            }
                        }
                        k += 1;
                    };
                },
                PlayerAction::AllIn => {
                    let mut player_seat: Seat = world
                        .read_model((hand.table_id, hand.current_turn_seat));
                    let all_in_amount = player_seat.chips;
                    let total_bet = ph.bet_this_round + all_in_amount;

                    if total_bet > hand.current_bet {
                        hand.current_bet = total_bet;
                    }

                    ph.bet_this_round = total_bet;
                    ph.total_bet += all_in_amount;
                    ph.is_all_in = true;
                    hand.pot += all_in_amount;

                    player_seat.chips = 0;
                    world.write_model(@player_seat);
                },
            }

            ph.has_acted = true;
            world.write_model(@ph);

            // Find next active seat
            let max = table.max_players;
            let current = hand.current_turn_seat;
            let mut next_seat = (current + 1) % max;
            let mut attempts: u8 = 0;
            while attempts < max {
                let s: Seat = world.read_model((table.table_id, next_seat));
                if s.is_occupied {
                    let next_ph: PlayerHand = world.read_model((hand_id, next_seat));
                    if !next_ph.has_folded && !next_ph.is_all_in {
                        break;
                    }
                }
                next_seat = (next_seat + 1) % max;
                attempts += 1;
            };

            // Check if round is complete
            let mut round_complete = true;
            let mut rc_i: u8 = 0;
            while rc_i < table.max_players {
                let s: Seat = world.read_model((table.table_id, rc_i));
                if s.is_occupied {
                    let rph: PlayerHand = world.read_model((hand_id, rc_i));
                    if rph.player != ZERO_ADDR.try_into().unwrap()
                        && !rph.has_folded
                        && !rph.is_all_in {
                        if !rph.has_acted || rph.bet_this_round != hand.current_bet {
                            round_complete = false;
                            break;
                        }
                    }
                }
                rc_i += 1;
            };

            if hand.active_players <= 1 {
                hand.phase = GamePhase::Settling;
            } else if round_complete {
                // Advance phase
                hand.phase =
                    match hand.phase {
                        GamePhase::BettingPreflop => GamePhase::DealingFlop,
                        GamePhase::BettingFlop => GamePhase::DealingTurn,
                        GamePhase::BettingTurn => GamePhase::DealingRiver,
                        GamePhase::BettingRiver => GamePhase::Showdown,
                        _ => hand.phase,
                    };
                hand.current_bet = 0;
                // Reset bet_this_round and has_acted
                let mut ri: u8 = 0;
                while ri < table.max_players {
                    let s: Seat = world.read_model((table.table_id, ri));
                    if s.is_occupied {
                        let mut rph: PlayerHand = world.read_model((hand_id, ri));
                        if rph.player != ZERO_ADDR.try_into().unwrap() {
                            rph.has_acted = false;
                            rph.bet_this_round = 0;
                            world.write_model(@rph);
                        }
                    }
                    ri += 1;
                };
            } else {
                hand.current_turn_seat = next_seat;
                hand.phase_deadline = get_block_timestamp() + 45;
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
