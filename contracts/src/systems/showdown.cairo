#[starknet::interface]
pub trait IShowdown<T> {
    /// Player reveals their hole cards by providing the card IDs
    /// (computed off-chain from the collected reveal tokens)
    fn reveal_hand(ref self: T, hand_id: u64, card_1_id: u8, card_2_id: u8);
    /// Called after all remaining players have revealed to determine the winner
    fn compute_winner(ref self: T, hand_id: u64);
}

#[dojo::contract]
pub mod showdown_system {
    use dojo::model::ModelStorage;
    use starknet::get_caller_address;
    use super::IShowdown;
    use crate::models::hand::{Hand, PlayerHand};
    use crate::models::card::CommunityCards;
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;
    use crate::utils::hand_evaluator::evaluate_best_hand;
    use crate::utils::constants::CARD_NOT_DEALT;

    #[abi(embed_v0)]
    impl ShowdownImpl of IShowdown<ContractState> {
        fn reveal_hand(ref self: ContractState, hand_id: u64, card_1_id: u8, card_2_id: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Showdown, 'not showdown phase');

            // Find caller's seat
            let table: Table = world.read_model(hand.table_id);
            let mut seat_idx: u8 = 255;
            let mut i: u8 = 0;
            while i < table.max_players {
                let seat: Seat = world.read_model((hand.table_id, i));
                if seat.is_occupied && seat.player == caller {
                    seat_idx = i;
                    break;
                }
                i += 1;
            };
            assert(seat_idx != 255, 'player not at table');

            let mut ph: PlayerHand = world.read_model((hand_id, seat_idx));
            assert(!ph.has_folded, 'player folded');
            assert(ph.hole_card_1_id == CARD_NOT_DEALT, 'already revealed');

            // Validate card IDs
            assert(card_1_id < 52 && card_2_id < 52, 'invalid card id');
            assert(card_1_id != card_2_id, 'cards must be different');

            // Store revealed card IDs
            // In production: these would be verified against the decrypt tokens
            // The off-chain client computes: M = C2 - sum(tokens) and maps M back to card_id
            ph.hole_card_1_id = card_1_id;
            ph.hole_card_2_id = card_2_id;
            world.write_model(@ph);
        }

        fn compute_winner(ref self: ContractState, hand_id: u64) {
            let mut world = self.world_default();

            let mut hand: Hand = world.read_model(hand_id);
            assert(hand.phase == GamePhase::Showdown, 'not showdown phase');

            let table: Table = world.read_model(hand.table_id);
            let comm: CommunityCards = world.read_model(hand_id);

            // Verify all community cards are revealed
            assert(comm.flop_1 != CARD_NOT_DEALT, 'community cards not set');

            // Check all non-folded players have revealed
            let mut all_revealed = true;
            let mut i: u8 = 0;
            while i < table.max_players {
                let ph: PlayerHand = world.read_model((hand_id, i));
                if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                    if ph.hole_card_1_id == CARD_NOT_DEALT {
                        all_revealed = false;
                        break;
                    }
                }
                i += 1;
            };
            assert(all_revealed, 'not all players revealed');

            // Evaluate each player's hand and find the winner
            let mut best_rank: u8 = 0;
            let mut best_tb: u32 = 0;
            let mut winner_seat: u8 = 255;

            let mut j: u8 = 0;
            while j < table.max_players {
                let ph: PlayerHand = world.read_model((hand_id, j));
                if ph.player != 0.try_into().unwrap() && !ph.has_folded {
                    // Build 7-card hand: 2 hole + 5 community
                    let cards = array![
                        ph.hole_card_1_id,
                        ph.hole_card_2_id,
                        comm.flop_1,
                        comm.flop_2,
                        comm.flop_3,
                        comm.turn,
                        comm.river,
                    ];

                    let (rank, tb) = evaluate_best_hand(cards.span());

                    if rank > best_rank || (rank == best_rank && tb > best_tb) {
                        best_rank = rank;
                        best_tb = tb;
                        winner_seat = j;
                    }
                }
                j += 1;
            };

            assert(winner_seat != 255, 'no winner found');

            // Award pot to winner
            let mut winner_seat_model: Seat = world.read_model((hand.table_id, winner_seat));
            winner_seat_model.chips += hand.pot;
            world.write_model(@winner_seat_model);

            // Transition to settling
            hand.pot = 0;
            hand.phase = GamePhase::Settling;
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
