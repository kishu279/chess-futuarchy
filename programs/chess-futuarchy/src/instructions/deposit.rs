use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use anchor_spl::{associated_token::AssociatedToken, token::Token};

use crate::state::{Config, UserBet};
use crate::{errors::Error, event};

#[derive(Accounts)]
pub struct DepositInstruction<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.seed.to_le_bytes().as_ref()],
        bump = market.config_bump,
    )]
    pub market: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"vault", market.seed.to_le_bytes().as_ref()],
        bump = market.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = UserBet::DISCRIMINATOR.len() + UserBet::INIT_SPACE,
        seeds = [b"user_bet", depositor.key().as_ref(), market.key().as_ref()],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,

    // #[account(
    //     mut,
    //     seeds = [b"collateral-vault", market.seed.to_le_bytes().as_ref()],
    //     bump = market.vault_bump,
    // )]
    // pub market_vault_authority: Account<'info, TokenAccount>,

    // #[account(
    //     mut,
    //     associated_token::mint = collateral_mint,
    //     associated_token::authority = market_vault_authority,
    // )]
    // pub market_vault: Account<'info, TokenAccount>,
    // #[account(
    //     mut,
    //     associated_token::mint = collateral_mint,
    //     associated_token::authority = depositor,
    // )]
    // pub user_ata: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> DepositInstruction<'info> {
    pub fn process(
        &mut self,
        amount: u64, // in lampoits
        is_player_x: bool,
        bump: DepositInstructionBumps,
    ) -> Result<()> {
        // let amount = amount_in_sol
        //     .checked_mul(1_000_000_000.0 as u64)
        //     .ok_or(Error::Overflow)?;

        let market = &mut self.market;
        let clock = Clock::get()?;
        let user_bet = &mut self.user_bet;

        // checking the market constraint
        require!(!market.is_resolved, Error::MarketResolved);
        require!(!market.is_paused, Error::MarketPaused);
        require!(amount > 0, Error::InvalidAmount);
        require!(
            market.start_time <= clock.unix_timestamp,
            Error::InvalidTime
        );
        require!(clock.unix_timestamp <= market.end_time, Error::InvalidTime);

        // fill inside the user bet
        require!(amount >= market.min_bet, Error::AmountBelowMin);
        if market.max_bet != 0 {
            require!(amount <= market.max_bet, Error::AmountAboveMax);
        }

        let expected_vault_key = Pubkey::create_program_address(
            &[
                b"vault",
                market.seed.to_le_bytes().as_ref(),
                &[market.vault_bump],
            ],
            &crate::id(),
        )
        .map_err(|_| Error::InvalidSeeds)?;

        require_keys_eq!(expected_vault_key, self.vault.key(), Error::InvalidPda);

        let is_new = user_bet.bettor == Pubkey::default();
        if is_new {
            // Initialize the user bet FIRST
            user_bet.bet_on_x = is_player_x;
            user_bet.bettor = self.depositor.key();
            user_bet.bump = bump.user_bet;
            user_bet.created_at = clock.unix_timestamp;
            user_bet.market_id = market.key();
            user_bet.staked_amount = amount;
            user_bet.is_claimed = false;
        } else {
            // Update existing bet (no side switching allowed)
            require!(user_bet.bet_on_x == is_player_x, Error::OutcomeMismatch);
            user_bet.staked_amount = user_bet
                .staked_amount
                .checked_add(amount)
                .ok_or(Error::Overflow)?;
            user_bet.created_at = clock.unix_timestamp;
        }

        // Update market totals BEFORE transfer
        if is_player_x {
            market.total_bets_x = market
                .total_bets_x
                .checked_add(amount)
                .ok_or(Error::Overflow)?;
        } else {
            market.total_bets_y = market
                .total_bets_y
                .checked_add(amount)
                .ok_or(Error::Overflow)?;
        }

        let cpi_ctx = CpiContext::new(
            self.system_program.to_account_info(),
            Transfer {
                from: self.depositor.to_account_info(),
                to: self.vault.to_account_info(),
            },
        );

        transfer(cpi_ctx, amount)?;

        if is_new {
            emit!(event::UserBetPlaced {
                bettor: self.depositor.key(),
                market: market.key(),
                is_player_x,
                amount,
            });
        } else {
            emit!(event::UserBetUpdated {
                bettor: self.depositor.key(),
                market: market.key(),
                is_player_x,
                amount,
            });
        }

        Ok(())
    }
}
