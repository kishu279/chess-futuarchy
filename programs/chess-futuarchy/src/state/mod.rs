use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub seed: u64,

    // market authority
    pub authority: Pubkey,
    pub resolution_authority: Pubkey,

    // players to bet on
    pub player_a: Pubkey,
    pub player_b: Pubkey,

    // in return of each bet
    // pub collateral_mint: Pubkey,
    pub market_vault: Pubkey,

    // resolution state
    pub is_resolved: bool,
    pub is_paused: bool,
    pub winner_x: Option<bool>,

    // amount staked for each player
    pub total_bets_x: u64,
    pub total_bets_y: u64,

    // polict limits
    pub min_bet: u64,
    pub max_bet: u64,

    // match
    pub start_time: i64,
    pub end_time: i64,
    pub resolution_time: i64,

    // economics
    pub fee: u16,
    pub treasury: Pubkey,
    pub collected_fees: u64,
    pub distributable_amount: u64,

    // pda bumps
    pub config_bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserBet {
    pub bettor: Pubkey,
    pub market_id: Pubkey,
    pub staked_amount: u64,
    pub bet_on_x: bool,
    pub is_claimed: bool,
    pub created_at: i64,
    pub bump: u8,
}
