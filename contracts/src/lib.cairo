pub mod models {
    pub mod enums;
    pub mod table;
    pub mod hand;
    pub mod deck;
    pub mod card;
    pub mod chat;
    pub mod arena;
    pub mod egs;
}

pub mod systems {
    pub mod lobby;
    pub mod game_setup;
    pub mod shuffle;
    pub mod dealing;
    pub mod betting;
    pub mod showdown;
    pub mod settle;
    pub mod chat;
    pub mod timeout;
    pub mod arena;
    pub mod egs;
}

pub mod utils {
    pub mod constants;
    pub mod card_mapping;
    pub mod hand_evaluator;
    pub mod side_pots;
}
