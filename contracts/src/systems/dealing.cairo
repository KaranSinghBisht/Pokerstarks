#[starknet::interface]
pub trait IDealing<T> {
    fn submit_reveal_token(
        ref self: T,
        hand_id: u64,
        card_position: u8,
        token_x: felt252,
        token_y: felt252,
        proof: Array<felt252>,
    );
    fn submit_reveal_tokens_batch(
        ref self: T,
        hand_id: u64,
        positions: Array<u8>,
        tokens_x: Array<felt252>,
        tokens_y: Array<felt252>,
        proofs: Array<Array<felt252>>,
    );
}

#[dojo::contract]
pub mod dealing_system {
    use dojo::model::ModelStorage;
    use starknet::get_caller_address;
    use super::IDealing;
    use crate::models::hand::Hand;
    use crate::models::card::RevealToken;
    use crate::models::table::{Table, Seat};
    use crate::models::enums::GamePhase;

    #[abi(embed_v0)]
    impl DealingImpl of IDealing<ContractState> {
        fn submit_reveal_token(
            ref self: ContractState,
            hand_id: u64,
            card_position: u8,
            token_x: felt252,
            token_y: felt252,
            proof: Array<felt252>,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let hand: Hand = world.read_model(hand_id);
            // Verify we're in a dealing phase
            assert(
                hand.phase == GamePhase::DealingPreflop
                    || hand.phase == GamePhase::DealingFlop
                    || hand.phase == GamePhase::DealingTurn
                    || hand.phase == GamePhase::DealingRiver,
                'not dealing phase',
            );

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

            // Check token hasn't been submitted already
            let existing: RevealToken = world.read_model((hand_id, card_position, seat_idx));
            assert(!existing.proof_verified, 'token already submitted');

            // TODO: Verify proof via Garaga decrypt verifier
            // For now, accept all tokens

            // Store the reveal token
            let token = RevealToken {
                hand_id,
                card_position,
                player_seat: seat_idx,
                token_x,
                token_y,
                proof_verified: true,
            };
            world.write_model(@token);

            // TODO: Check if all required tokens for this phase are collected
            // If so, advance to the next phase
        }

        fn submit_reveal_tokens_batch(
            ref self: ContractState,
            hand_id: u64,
            positions: Array<u8>,
            tokens_x: Array<felt252>,
            tokens_y: Array<felt252>,
            proofs: Array<Array<felt252>>,
        ) {
            // Batch version for gas efficiency
            assert(positions.len() == tokens_x.len(), 'length mismatch');
            assert(positions.len() == tokens_y.len(), 'length mismatch');

            let mut i: u32 = 0;
            while i < positions.len() {
                // TODO: call submit_reveal_token logic for each
                i += 1;
            };
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"pokerstarks")
        }
    }
}
