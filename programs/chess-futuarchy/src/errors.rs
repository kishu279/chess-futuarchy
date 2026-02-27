use anchor_lang::prelude::*;

#[error_code]
pub enum Error {
    #[msg("The account is not initialized")]
    Uninitialized,

    #[msg("Time is invalid")]
    InvalidTime,

    #[msg("Invalid Bet Amount")]
    InvalidAmount,

    #[msg("Invalid Fee BPS")]
    InvalidFeeBps,

    #[msg("Invalid PDA")]
    InvalidPda,

    #[msg("Invalid Seeds")]
    InvalidSeeds,

    #[msg("Market is paused")]
    MarketPaused,

    #[msg("Market is resolved")]
    MarketResolved,

    #[msg("Invalid outcome")]
    InvalidOutcome,

    #[msg("Amount below minimum")]
    AmountBelowMin,

    #[msg("Amount above maximum")]
    AmountAboveMax,

    #[msg("Invalid token mints")]
    InvalidTokenMint,

    #[msg("Outcome mismatch")]
    OutcomeMismatch,

    #[msg("Overflow Math")]
    Overflow,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Bet already claimed")]
    BetAlreadyClaimed,

    #[msg("Market not yet resolved")]
    MarketNotResolved,

    #[msg("Incorrect outcome")]
    IncorrectOutcome,

    #[msg("No bets placed")]
    NoBetsPlaced,

    #[msg("Invalid mint")]
    InvalidMint,

    #[msg("Invalid treasury")]
    InvalidTreasury,

    #[msg("Invalid player")]
    InvalidPlayer,

    #[msg("Bet not claimable yet")]
    BetNotClaimable,
}
