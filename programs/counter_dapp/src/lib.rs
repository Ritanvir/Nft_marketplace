use anchor_lang::prelude::*;

declare_id!("BoXtsmHoq4ozCanyCUKuPMqPHJF3ddCNSkAzA7y18tSN");


#[program]
pub mod counter_dapp {
    use super::*;

    // Create the counter PDA for the connected wallet (authority)
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.authority = ctx.accounts.user.key();
        counter.count = 0;
        Ok(())
    }

    // Increment by 1 (only authority can call)
    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;

        require_keys_eq!(
            counter.authority,
            ctx.accounts.user.key(),
            CustomError::Unauthorized
        );

        counter.count = counter.count.checked_add(1).ok_or(CustomError::Overflow)?;
        Ok(())
    }

    // Optional helper: reset to 0 (only authority)
    pub fn reset(ctx: Context<Increment>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;

        require_keys_eq!(
            counter.authority,
            ctx.accounts.user.key(),
            CustomError::Unauthorized
        );

        counter.count = 0;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    // PDA: seeds = ["counter", user_pubkey]
    #[account(
        init,
        payer = user,
        seeds = [b"counter", user.key().as_ref()],
        bump,
        space = 8 + 32 + 8 // discriminator + Pubkey + u64
    )]
    pub counter: Account<'info, Counter>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    // Ensure the PDA address matches the seeds for this user
    #[account(
        mut,
        seeds = [b"counter", user.key().as_ref()],
        bump
    )]
    pub counter: Account<'info, Counter>,

    pub user: Signer<'info>,
}

#[account]
pub struct Counter {
    pub authority: Pubkey,
    pub count: u64,
}

#[error_code]
pub enum CustomError {
    #[msg("Only the authority can modify this counter.")]
    Unauthorized,

    #[msg("Counter overflow.")]
    Overflow,
}
