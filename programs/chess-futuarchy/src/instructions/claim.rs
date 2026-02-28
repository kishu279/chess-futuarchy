use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::errors::Error;
use crate::event::*;
use crate::state::{Config, UserBet};

#[derive(Accounts)]
pub struct ClaimMarket<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: depositor whose bet PDA we're closing
    pub depositor: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"market", market.seed.to_le_bytes().as_ref()],
        bump = market.config_bump
    )]
    pub market: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"vault", market.seed.to_le_bytes().as_ref()],
        bump = market.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        mut,
        close = signer,
        seeds = [b"user_bet", depositor.key().as_ref(), market.key().as_ref()],
        bump = user_bet.bump
    )]
    pub user_bet: Account<'info, UserBet>,

    #[account(mut)]
    /// CHECK FOR THE TREASURY ACCOUNT
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> ClaimMarket<'info> {
    pub fn claim_market(&mut self) -> Result<()> {
        require!(self.market.is_resolved, Error::MarketNotResolved);
        require!(!self.market.is_paused, Error::MarketPaused);
        require!(!self.user_bet.is_claimed, Error::BetAlreadyClaimed);

        let winner_x = self.market.winner_x.ok_or(Error::MarketNotResolved)?;
        let market_key = self.market.key();

        if self.user_bet.bet_on_x != winner_x {
            self.user_bet.is_claimed = true;
            emit!(MarketClaimed {
                market: market_key,
                bettor: self.signer.key(),
                payout_amount: 0,
                created_at: Clock::get()?.unix_timestamp,
            });
            return Ok(());
        }

        let distributable_amount = self.market.distributable_amount;
        let winner_total = if winner_x {
            self.market.total_bets_x
        } else {
            self.market.total_bets_y
        };
        let staked_amount = self.user_bet.staked_amount;
        let seed_bytes = self.market.seed.to_le_bytes();
        let bump = self.market.vault_bump;

        let payout_u128 = (staked_amount as u128)
            .checked_mul(distributable_amount as u128)
            .ok_or(Error::Overflow)?
            .checked_div(winner_total as u128)
            .ok_or(Error::Overflow)?;

        let payout: u64 = payout_u128.try_into().map_err(|_| Error::Overflow)?;

        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", seed_bytes.as_ref(), &[bump]]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.system_program.to_account_info(),
            Transfer {
                from: self.vault.to_account_info(),
                to: self.signer.to_account_info(),
            },
            signer_seeds,
        );

        transfer(cpi_ctx, payout)?;

        self.market.distributable_amount = distributable_amount
            .checked_sub(payout)
            .ok_or(Error::Overflow)?;

        self.user_bet.is_claimed = true;

        emit!(MarketClaimed {
            market: market_key,
            bettor: self.signer.key(),
            payout_amount: payout,
            created_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
