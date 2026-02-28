use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::state::Config;
use crate::errors::Error;

#[derive(Accounts)]
pub struct SweepVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"market", market.seed.to_le_bytes().as_ref()],
        bump = market.config_bump,
        has_one = authority @ Error::Unauthorized,
    )]
    pub market: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"vault", market.seed.to_le_bytes().as_ref()],
        bump = market.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> SweepVault<'info> {
    pub fn sweep(&mut self) -> Result<()> {
        require!(self.market.is_resolved, Error::MarketNotResolved);

        let vault_balance = self.vault.to_account_info().lamports();
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(0);

        let sweepable = vault_balance.saturating_sub(min_rent);
        if sweepable == 0 {
            return Ok(());
        }

        let seed_bytes = self.market.seed.to_le_bytes();
        let bump = self.market.vault_bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", seed_bytes.as_ref(), &[bump]]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.system_program.to_account_info(),
            Transfer {
                from: self.vault.to_account_info(),
                to: self.authority.to_account_info(),
            },
            signer_seeds,
        );

        transfer(cpi_ctx, sweepable)?;

        Ok(())
    }
}
