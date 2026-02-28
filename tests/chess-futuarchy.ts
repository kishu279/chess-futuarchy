import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ChessFutuarchy } from "../target/types/chess_futuarchy";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const formatSol = (lamports: number | bigint) =>
  `${(Number(lamports) / anchor.web3.LAMPORTS_PER_SOL).toFixed(4)} SOL`;
const shortKey = (pk: anchor.web3.PublicKey) =>
  `${pk.toBase58().slice(0, 6)}...${pk.toBase58().slice(-4)}`;
const pad = (s: string, n: number) => s.padEnd(n);

function header(title: string) {
  const line = "═".repeat(72);
  console.log(`\n╔${line}╗`);
  console.log(`║  ${title.padEnd(70)}║`);
  console.log(`╚${line}╝`);
}

function section(title: string) {
  console.log(`\n  ┌─ ${title}`);
}

function row(label: string, value: string) {
  console.log(`  │  ${pad(label, 28)} ${value}`);
}

function divider() {
  console.log(`  └${"─".repeat(60)}`);
}

describe("chess-futuarchy", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.chessFutuarchy as Program<ChessFutuarchy>;

  let alice: anchor.web3.Keypair;
  let bob: anchor.web3.Keypair;
  let charlie: anchor.web3.Keypair;
  let diana: anchor.web3.Keypair;
  let eve: anchor.web3.Keypair;

  let player1: anchor.web3.Keypair;
  let player2: anchor.web3.Keypair;

  let seed: anchor.BN;
  let fee: number;

  let marketPda: anchor.web3.PublicKey;
  let marketVault: anchor.web3.PublicKey;

  before("all", async () => {
    alice = anchor.web3.Keypair.generate();
    bob = anchor.web3.Keypair.generate();
    charlie = anchor.web3.Keypair.generate();
    diana = anchor.web3.Keypair.generate();
    eve = anchor.web3.Keypair.generate();
    player1 = anchor.web3.Keypair.generate();
    player2 = anchor.web3.Keypair.generate();

    await airdropSol(
      [
        alice.publicKey,
        bob.publicKey,
        charlie.publicKey,
        diana.publicKey,
        eve.publicKey,
      ],
      10 * anchor.web3.LAMPORTS_PER_SOL,
    );

    await airdropSol(
      [player1.publicKey, player2.publicKey],
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );

    seed = new anchor.BN(Date.now());
    fee = 300;

    [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("market"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );
    [marketVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );
  });

  it("Is initialized!", async () => {
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .initialize(
        seed,
        fee,
        new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL),
        new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL),
        provider.wallet.publicKey,
        player1.publicKey,
        player2.publicKey,
        new anchor.BN(now + 1),
        new anchor.BN(now + 15),
        new anchor.BN(now + 19),
      )
      .accountsPartial({ signer: provider.wallet.publicKey })
      .rpc();

    header("MARKET CREATED");

    section("Market Config");
    row("Market PDA",   shortKey(marketPda));
    row("Vault PDA",    shortKey(marketVault));
    row("Seed",         seed.toString());
    row("Fee",          `${fee / 100}%`);
    row("Min Bet",      "0.1000 SOL");
    row("Max Bet",      "2.0000 SOL");
    row("Opens in",     "1 second");
    divider();

    section("Players");
    row("Player X  (Magnus Carlsen)",  shortKey(player1.publicKey));
    row("Player Y  (Hikaru Nakamura)", shortKey(player2.publicKey));
    divider();

    section("Authority");
    row("Resolution Authority", shortKey(provider.wallet.publicKey));
    row("Treasury",             shortKey(provider.wallet.publicKey));
    divider();
  });

  it("Allows users to place bets", async () => {
    await sleep(1500);

    const bets = [
      { name: "Alice",   keypair: alice,   amount: 0.5, player: "Magnus (X)",  betOnX: true  },
      { name: "Bob",     keypair: bob,     amount: 0.3, player: "Hikaru (Y)",  betOnX: false },
      { name: "Charlie", keypair: charlie, amount: 0.8, player: "Magnus (X)",  betOnX: true  },
      { name: "Diana",   keypair: diana,   amount: 0.5, player: "Hikaru (Y)",  betOnX: false },
      { name: "Eve",     keypair: eve,     amount: 1.0, player: "Hikaru (Y)",  betOnX: false },
    ];

    header("BETS PLACED");
    section("Bettor Deposits");
    console.log(`  │  ${"Bettor".padEnd(12)} ${"Address".padEnd(16)} ${"Side".padEnd(14)} ${"Staked".padEnd(12)} Balance After`);
    console.log(`  │  ${"─".repeat(66)}`);

    for (const bet of bets) {
      await program.methods
        .deposit(
          new anchor.BN(bet.amount * anchor.web3.LAMPORTS_PER_SOL),
          bet.betOnX,
        )
        .accountsPartial({
          depositor: bet.keypair.publicKey,
          market: marketPda,
          vault: marketVault,
        })
        .signers([bet.keypair])
        .rpc();

      const balance = await provider.connection.getBalance(bet.keypair.publicKey);
      console.log(
        `  │  ${pad(bet.name, 12)} ${pad(shortKey(bet.keypair.publicKey), 16)} ${pad(bet.player, 14)} ${pad(formatSol(bet.amount * anchor.web3.LAMPORTS_PER_SOL), 12)} ${formatSol(balance)}`,
      );
      await sleep(1500);
    }

    divider();

    const market = await program.account.config.fetch(marketPda);
    const vaultLamports = (await provider.connection.getAccountInfo(marketVault)).lamports;

    section("Betting Summary");
    row("Total staked on Magnus (X)", formatSol(market.totalBetsX.toNumber()));
    row("Total staked on Hikaru (Y)", formatSol(market.totalBetsY.toNumber()));
    row("Total vault balance",        formatSol(vaultLamports));
    divider();
  });

  it("Allows oracle to resolve the market", async () => {
    await sleep(5000);

    await program.methods
      .resolve(true)
      .accountsPartial({
        signer: provider.wallet.publicKey,
        market: marketPda,
        vault: marketVault,
        treasury: provider.wallet.publicKey,
        playerA: player1.publicKey,
        playerB: player2.publicKey,
      })
      .signers([provider.wallet.payer])
      .rpc();

    const marketData = await program.account.config.fetch(marketPda);
    const vault      = await provider.connection.getAccountInfo(marketVault);

    const player1Balance = await provider.connection.getBalance(player1.publicKey);
    const player2Balance = await provider.connection.getBalance(player2.publicKey);

    header("MARKET RESOLVED");

    section("Resolution");
    row("Winner",               "Magnus Carlsen (X)");
    row("Is Resolved",          String(marketData.isResolved));
    row("Winner X",             String(marketData.winnerX));
    row("Collected Fees",       formatSol(marketData.collectedFees.toNumber()));
    row("Distributable Amount", formatSol(marketData.distributableAmount.toNumber()));
    row("Vault Remaining",      formatSol(vault?.lamports ?? 0));
    divider();

    section("Player Payouts  (7% winner / 3% loser)");
    row("Player X  Magnus  (winner)", formatSol(player1Balance));
    row("Player Y  Hikaru  (loser)",  formatSol(player2Balance));
    divider();

    section("Bettor Balances After Resolution");
    for (const [name, kp] of [
      ["Alice",   alice],
      ["Bob",     bob],
      ["Charlie", charlie],
      ["Diana",   diana],
      ["Eve",     eve],
    ] as [string, anchor.web3.Keypair][]) {
      const bal = await provider.connection.getBalance(kp.publicKey);
      row(name, formatSol(bal));
    }
    divider();
  });

  it("Allows bettors to claim their payouts", async () => {
    const bettors = [
      { name: "Alice",   keypair: alice,   betOnX: true  },
      { name: "Bob",     keypair: bob,     betOnX: false },
      { name: "Charlie", keypair: charlie, betOnX: true  },
      { name: "Diana",   keypair: diana,   betOnX: false },
      { name: "Eve",     keypair: eve,     betOnX: false },
    ];

    header("CLAIM PAYOUTS");
    section("Claim Results");
    console.log(`  │  ${"Bettor".padEnd(12)} ${"Side".padEnd(14)} ${"Payout".padEnd(14)} Balance After`);
    console.log(`  │  ${"─".repeat(60)}`);

    for (const bettor of bettors) {
      const [userBetPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_bet"),
          bettor.keypair.publicKey.toBuffer(),
          marketPda.toBuffer(),
        ],
        program.programId,
      );

      const balanceBefore = await provider.connection.getBalance(bettor.keypair.publicKey);

      await program.methods
        .claim()
        .accountsPartial({
          signer:    bettor.keypair.publicKey,
          depositor: bettor.keypair.publicKey,
          market:    marketPda,
          vault:     marketVault,
          userBet:   userBetPda,
          treasury:  provider.wallet.publicKey,
        })
        .signers([bettor.keypair])
        .rpc();

      const balanceAfter = await provider.connection.getBalance(bettor.keypair.publicKey);
      const diff = balanceAfter - balanceBefore;
      const side = bettor.betOnX ? "Magnus (X)" : "Hikaru (Y)";
      const payout = diff > 0 ? `+${formatSol(diff)}` : formatSol(0);

      console.log(
        `  │  ${pad(bettor.name, 12)} ${pad(side, 14)} ${pad(payout, 14)} ${formatSol(balanceAfter)}`,
      );
    }

    divider();

    const vault      = await provider.connection.getAccountInfo(marketVault);
    const marketData = await program.account.config.fetch(marketPda);

    section("Final State");
    row("Vault Remaining",      formatSol(vault?.lamports ?? 0));
    row("Distributable Amount", formatSol(marketData.distributableAmount.toNumber()));
    row("Collected Fees",       formatSol(marketData.collectedFees.toNumber()));
    divider();
  });

  const airdropSol = async (
    publicKeys: anchor.web3.PublicKey[],
    amount: number,
  ) => {
    await Promise.all(
      publicKeys.map(async (publicKey) => {
        const sig = await provider.connection.requestAirdrop(publicKey, amount);
        await provider.connection.confirmTransaction(sig);
      }),
    );
  };
});
