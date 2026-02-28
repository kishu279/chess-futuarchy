use anchor_lang::prelude::*;

declare_id!("EhP3gZ1bk3aiA2gRtCYgf61qS7qfVCBEzXMiodrA751h");

pub mod errors;
pub mod event;
pub mod instructions;
pub mod state;

pub use instructions::*;

#[program]
pub mod chess_futuarchy {
    use super::*;

    pub fn initialize(
        ctx: Context<MakeMarket>,
        seed: u64,
        fee: u16,
        max_bet: u64,
        min_bet: u64,
        treasury: Pubkey,
        player_a: Pubkey,
        player_b: Pubkey,
        start_time: i64,
        end_time: i64,
        resolution_time: i64,
    ) -> Result<()> {
        ctx.accounts.initialize(
            seed,
            fee,
            max_bet,
            min_bet,
            treasury,
            player_a,
            player_b,
            start_time,
            end_time,
            resolution_time,
            &ctx.bumps,
        )?;
        Ok(())
    }

    pub fn deposit(ctx: Context<DepositInstruction>, amount: u64, is_player_x: bool) -> Result<()> {
        ctx.accounts.process(amount, is_player_x, ctx.bumps)?;
        Ok(())
    }

    pub fn resolve(ctx: Context<ResolveInstruction>, is_player_x_won: bool) -> Result<()> {
        ctx.accounts.resolve(is_player_x_won)?;
        Ok(())
    }

    pub fn claim(ctx: Context<ClaimMarket>) -> Result<()> {
        ctx.accounts.claim_market()?;
        Ok(())
    }
}
