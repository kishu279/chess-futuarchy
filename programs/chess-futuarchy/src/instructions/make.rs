use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{errors::Error, state::Config};

#[derive(Accounts)]
#[instruction(seed: u8)]
pub struct MakeMarket<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    // mint for collateral
    // pub collateral_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = signer,
        seeds = [b"market", seed.to_le_bytes().as_ref()],
        space = Config::DISCRIMINATOR.len() + Config::INIT_SPACE,
        bump
    )]
    pub market: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"vault", seed.to_le_bytes().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    // #[account(
    //     seeds = [b"collater-vault", seed.to_le_bytes().as_ref()],
    //     bump
    // )]
    // pub market_vault_authority: Account<'info, TokenAccount>,

    // #[account(
    //     init,
    //     payer = signer,
    //     associated_token::mint = collateral_mint,
    //     associated_token::authority = market_vault_authority,
    // )]
    // pub market_vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}

impl<'info> MakeMarket<'info> {
    pub fn initialize(
        &mut self,
        seed: u8,
        fee: u16,
        bump: MakeMarketBumps,
        max_bet: u64,
        min_bet: u64,
        treasury: Pubkey,
        player_a: Pubkey,
        player_b: Pubkey,
        start_time: i64,
        end_time: i64,
        resolution_time: i64,
    ) -> Result<()> {
        let clock = Clock::get()?;

        // time checks
        require!(start_time > clock.unix_timestamp, Error::InvalidTime); // start in future
        require!(start_time < end_time, Error::InvalidTime);
        require!(end_time <= resolution_time, Error::InvalidTime);

        // param sanity
        require!(fee <= 10_000, Error::InvalidFeeBps);
        require!(min_bet > 0, Error::InvalidAmount);
        if max_bet != 0 {
            require!(min_bet <= max_bet, Error::InvalidAmount);
        }

        let rent_exempt = Rent::get()?.minimum_balance(self.vault.to_account_info().data_len());

        // cpi to vault
        let cpi_accounts = Transfer {
            from: self.signer.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.signer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);

        transfer(cpi_ctx, rent_exempt)?;

        let expected_vault_key = Pubkey::create_program_address(
            &[b"vault", seed.to_le_bytes().as_ref(), &[bump.vault]],
            &crate::id(),
        )
        .map_err(|_| Error::InvalidSeeds)?;
        require_keys_eq!(expected_vault_key, self.vault.key(), Error::InvalidSeeds);

        self.market.set_inner(Config {
            seed,
            fee,
            player_a: player_a,
            player_b: player_b,
            market_vault: self.vault.key(),
            // collateral_mint: self.collateral_mint.key(),
            authority: self.signer.key(),
            resolution_authority: self.signer.key(),
            collected_fees: 0,
            config_bump: bump.market,
            distributable_amount: 0,
            is_resolved: false,
            winner_x: None,
            max_bet,
            min_bet,
            total_bets_x: 0,
            total_bets_y: 0,
            treasury,
            vault_bump: bump.vault,
            is_paused: false,
            start_time,
            end_time,
            resolution_time,
        });

        Ok(())
    }
}
