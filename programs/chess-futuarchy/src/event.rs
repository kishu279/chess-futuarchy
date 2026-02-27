use anchor_lang::prelude::*;

#[event]
pub struct UserBetPlaced {
    pub bettor: Pubkey,
    pub market: Pubkey,
    pub is_player_x: bool,
    pub amount: u64,
}

#[event]
pub struct UserBetUpdated {
    pub bettor: Pubkey,
    pub market: Pubkey,
    pub is_player_x: bool,
    pub amount: u64,
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub winning_outcome: u8,
    pub total_bets_x: u64,
    pub total_bets_y: u64,
}

#[event]
pub struct FundsDistributed {
    pub market: Pubkey,
    pub treasury_fee: u64,
    pub winner_share: u64,
    pub loser_share: u64,
    pub winning_outcome: u8,
}

#[event]
pub struct MarketClaimed {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub payout_amount: u64,
    pub created_at: i64,
}
