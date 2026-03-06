#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum TableState {
    #[default]
    Waiting,
    InProgress,
    Paused,
}

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum GamePhase {
    #[default]
    Setup,
    Shuffling,
    DealingPreflop,
    BettingPreflop,
    DealingFlop,
    BettingFlop,
    DealingTurn,
    BettingTurn,
    DealingRiver,
    BettingRiver,
    Showdown,
    Settling,
}

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum PlayerAction {
    #[default]
    Fold,
    Check,
    Call,
    Bet,
    Raise,
    AllIn,
}

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum MessageType {
    #[default]
    Text,
    Emote,
    System,
}

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum MatchStatus {
    #[default]
    Pending,
    InProgress,
    Complete,
}

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum AgentType {
    #[default]
    Human,
    Bot,
    Agent,
}

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum ChallengeStatus {
    #[default]
    Pending,
    Accepted,
    Declined,
    Expired,
}
