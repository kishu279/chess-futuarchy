use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use anchor_spl::token::Token;

use crate::state::Config;
use crate::{errors::Error, event};

#[derive(Accounts)]
pub struct ResolveInstruction<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"market", market.seed.to_le_bytes().as_ref()],
        bump = market.config_bump
    )]
    pub market: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"vault", market.seed.to_le_bytes().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    /// CHECK FOR THE TREASURY ACCOUNT
    pub treasury: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK FOR THE PLAYERS ACCOUNT
    pub player_a: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK FOR THE PLAYERS ACCOUNT
    pub player_b: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ResolveInstruction<'info> {
    pub fn resolve(&mut self, is_player_x_won: bool) -> Result<()> {
        require_keys_eq!(
            self.treasury.key(),
            self.market.treasury,
            Error::InvalidTreasury
        );
        require_keys_eq!(
            self.player_a.key(),
            self.market.player_a,
            Error::InvalidPlayer
        );
        require_keys_eq!(
            self.player_b.key(),
            self.market.player_b,
            Error::InvalidPlayer
        );

        require!(
            self.market.total_bets_x > 0 || self.market.total_bets_y > 0,
            Error::NoBetsPlaced
        );

        // authorized people can resolve
        require_keys_eq!(
            self.market.resolution_authority.key(),
            self.signer.key(),
            Error::Unauthorized
        );

        // DISTRIBUTE FUNDS
        self.distribute_amount(is_player_x_won)?;

        // 3. After all transfers succeed, update on-chain state
        self.market.is_resolved = true;

        match is_player_x_won {
            true => self.market.winner_x = Some(true),
            false => self.market.winner_x = Some(false),
        }

        // 4. Emit event after state is finalized
        emit!(event::MarketResolved {
            market: self.market.key(),
            winning_outcome: is_player_x_won,
            total_bets_x: self.market.total_bets_x,
            total_bets_y: self.market.total_bets_y,
        });

        Ok(())
    }

    fn distribute_amount(&mut self, is_player_x_won: bool) -> Result<()> {
        let market = &mut self.market;
        let bump = market.vault_bump;
        let seeds = market.seed.to_le_bytes();
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", seeds.as_ref(), &[bump]]];

        let market_vault_amount = self.vault.to_account_info().lamports() as u128;

        let treasury_fee: u128 = market_vault_amount
            .checked_mul(self.market.fee as u128)
            .ok_or(Error::Overflow)?
            .checked_div(10_000u128)
            .ok_or(Error::Overflow)?;

        // Remaining amount after treasury fee
        let remaining_amount: u128 = market_vault_amount
            .checked_sub(treasury_fee)
            .ok_or(Error::Overflow)?;

        // Calculate player shares: winner gets 7%, loser gets 3%
        let winner_share: u64 = remaining_amount
            .checked_mul(700u128)
            .ok_or(Error::Overflow)?
            .checked_div(10_000u128)
            .ok_or(Error::Overflow)? as u64;

        let loser_share: u64 = remaining_amount
            .checked_mul(300u128)
            .ok_or(Error::Overflow)?
            .checked_div(10_000u128)
            .ok_or(Error::Overflow)? as u64;

        // 1. Transfer treasury fee to treasury
        let treasury_fee_u64: u64 = treasury_fee.try_into().map_err(|_| Error::Overflow)?;

        let cpi_ctx_treasury = CpiContext::new_with_signer(
            self.system_program.to_account_info(),
            Transfer {
                from: self.vault.to_account_info(),
                to: self.signer.to_account_info(),
            },
            signer_seeds,
        );

        transfer(cpi_ctx_treasury, treasury_fee_u64)?;

        // 2. Transfer shares based on winning outcome

        let (winner_ata, loser_ata) = if is_player_x_won {
            (
                &self.player_a.to_account_info(),
                &self.player_b.to_account_info(),
            )
        } else {
            (
                &self.player_b.to_account_info(),
                &self.player_a.to_account_info(),
            )
        };

        // Transfer to winner (7%)
        let winner_share_u64: u64 = winner_share.try_into().map_err(|_| Error::Overflow)?;

        let cpi_ctx_winner = CpiContext::new_with_signer(
            self.system_program.to_account_info(),
            Transfer {
                from: self.vault.to_account_info(),
                to: winner_ata.to_account_info(),
            },
            signer_seeds,
        );

        transfer(cpi_ctx_winner, winner_share_u64)?;

        // Transfer to loser (3%)
        let loser_share_u64: u64 = loser_share.try_into().map_err(|_| Error::Overflow)?;

        let cpi_ctx_loser = CpiContext::new_with_signer(
            self.system_program.to_account_info(),
            Transfer {
                from: self.vault.to_account_info(),
                to: loser_ata.to_account_info(),
            },
            signer_seeds,
        );

        transfer(cpi_ctx_loser, loser_share_u64)?;

        // After successful transfers, update collected_fees (treasury fee only)
        self.market.collected_fees = self
            .market
            .collected_fees
            .checked_add(treasury_fee_u64)
            .ok_or(Error::Overflow)?;

        // Calculate distributable amount (remaining in vault after treasury fee and player shares)
        let total_distributed = treasury_fee_u64
            .checked_add(winner_share_u64)
            .ok_or(Error::Overflow)?
            .checked_add(loser_share_u64)
            .ok_or(Error::Overflow)?;
        let distributable = (market_vault_amount as u64)
            .checked_sub(total_distributed)
            .ok_or(Error::Overflow)?;
        self.market.distributable_amount = distributable;

        emit!(event::FundsDistributed {
            market: self.market.key(),
            treasury_fee: treasury_fee_u64,
            winner_share: winner_share_u64,
            loser_share: loser_share_u64,
            winning_outcome: is_player_x_won,
        });

        Ok(())
    }
}
