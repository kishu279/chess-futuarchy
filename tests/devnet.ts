import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ChessFutuarchy } from "../target/types/chess_futuarchy";
import * as fs from "fs";
import * as path from "path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
function section(title: string) { console.log(`\n  ┌─ ${title}`); }
function row(label: string, value: string) { console.log(`  │  ${pad(label, 30)} ${value}`); }
function divider() { console.log(`  └${"─".repeat(62)}`); }

function loadKeypairs(): Record<string, anchor.web3.Keypair> {
  const file = path.join(__dirname, "../keypairs/devnet.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `keypairs/devnet.json not found. Run: yarn ts-node scripts/generate-keypairs.ts`
    );
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  const result: Record<string, anchor.web3.Keypair> = {};
  for (const [name, data] of Object.entries(raw) as [string, any][]) {
    result[name] = anchor.web3.Keypair.fromSecretKey(
      Uint8Array.from(data.secretKey)
    );
  }
  return result;
}

async function fundAccount(
  connection: anchor.web3.Connection,
  payer: anchor.web3.Keypair,
  recipient: anchor.web3.PublicKey,
  lamports: number
) {
  const tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports,
    })
  );
  const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [payer]);
  return sig;
}

async function drainAccount(
  connection: anchor.web3.Connection,
  from: anchor.web3.Keypair,
  to: anchor.web3.PublicKey
) {
  const balance = await connection.getBalance(from.publicKey);
  const feeBuffer = 5_000;
  const sendable = balance - feeBuffer;
  if (sendable <= 0) return 0;

  const tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: sendable,
    })
  );
  await anchor.web3.sendAndConfirmTransaction(connection, tx, [from]);
  return sendable;
}

describe("chess-futuarchy [devnet]", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.chessFutuarchy as Program<ChessFutuarchy>;
  const connection = provider.connection;
  const personalWallet = (provider.wallet as anchor.Wallet).payer;

  let kp: Record<string, anchor.web3.Keypair>;
  let alice: anchor.web3.Keypair;
  let bob: anchor.web3.Keypair;
  let charlie: anchor.web3.Keypair;
  let diana: anchor.web3.Keypair;
  let eve: anchor.web3.Keypair;
  let player1: anchor.web3.Keypair;
  let player2: anchor.web3.Keypair;

  let seed: anchor.BN;
  const fee = 300;

  let marketPda: anchor.web3.PublicKey;
  let marketVault: anchor.web3.PublicKey;

  const FUND_BETTOR = 0.6 * anchor.web3.LAMPORTS_PER_SOL;

  before("load keypairs and fund bettors", async () => {
    kp = loadKeypairs();
    alice   = kp["alice"];
    bob     = kp["bob"];
    charlie = kp["charlie"];
    diana   = kp["diana"];
    eve     = kp["eve"];
    player1 = kp["player1"];
    player2 = kp["player2"];

    seed = new anchor.BN(Date.now());

    [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("market"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [marketVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    header("FUNDING BETTORS FROM PERSONAL WALLET");

    const bettorAccounts = [
      { name: "Alice",   kp: alice   },
      { name: "Bob",     kp: bob     },
      { name: "Charlie", kp: charlie },
      { name: "Diana",   kp: diana   },
      { name: "Eve",     kp: eve     },
    ];

    section("Transfers");
    for (const acc of bettorAccounts) {
      await fundAccount(connection, personalWallet, acc.kp.publicKey, FUND_BETTOR);
      row(acc.name, `funded ${formatSol(FUND_BETTOR)}  →  ${shortKey(acc.kp.publicKey)}`);
    }

    const personalBalance = await connection.getBalance(personalWallet.publicKey);
    divider();
    section("Personal Wallet");
    row("Address",       shortKey(personalWallet.publicKey));
    row("Balance After", formatSol(personalBalance));
    divider();

    section("Players  (no funding needed — public keys only)");
    row("Player X  (Magnus Carlsen)",  shortKey(player1.publicKey));
    row("Player Y  (Hikaru Nakamura)", shortKey(player2.publicKey));
    divider();
  });

  it("Initializes the market", async () => {
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .initialize(
        seed,
        fee,
        new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL),
        new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL),
        personalWallet.publicKey,
        player1.publicKey,
        player2.publicKey,
        new anchor.BN(now + 5),
        new anchor.BN(now + 60),
        new anchor.BN(now + 90),
      )
      .accountsPartial({ signer: personalWallet.publicKey })
      .signers([personalWallet])
      .rpc();

    header("MARKET CREATED");
    section("Market Config");
    row("Market PDA",  shortKey(marketPda));
    row("Vault PDA",   shortKey(marketVault));
    row("Seed",        seed.toString());
    row("Fee",         `${fee / 100}%`);
    row("Min Bet",     "0.1000 SOL");
    row("Max Bet",     "0.5000 SOL");
    divider();
    section("Players");
    row("Player X  (Magnus Carlsen)",  shortKey(player1.publicKey));
    row("Player Y  (Hikaru Nakamura)", shortKey(player2.publicKey));
    divider();
  });

  it("Places bets from all bettors", async () => {
    await sleep(6000);

    const bets = [
      { name: "Alice",   keypair: alice,   amount: 0.2, betOnX: true,  player: "Magnus (X)"  },
      { name: "Bob",     keypair: bob,     amount: 0.2, betOnX: false, player: "Hikaru (Y)"  },
      { name: "Charlie", keypair: charlie, amount: 0.3, betOnX: true,  player: "Magnus (X)"  },
      { name: "Diana",   keypair: diana,   amount: 0.2, betOnX: false, player: "Hikaru (Y)"  },
      { name: "Eve",     keypair: eve,     amount: 0.3, betOnX: false, player: "Hikaru (Y)"  },
    ];

    header("BETS PLACED");
    section("Bettor Deposits");
    console.log(`  │  ${"Bettor".padEnd(12)} ${"Address".padEnd(16)} ${"Side".padEnd(14)} ${"Staked".padEnd(14)} Balance After`);
    console.log(`  │  ${"─".repeat(68)}`);

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

      const balance = await connection.getBalance(bet.keypair.publicKey);
      console.log(
        `  │  ${pad(bet.name, 12)} ${pad(shortKey(bet.keypair.publicKey), 16)} ${pad(bet.player, 14)} ${pad(formatSol(bet.amount * anchor.web3.LAMPORTS_PER_SOL), 14)} ${formatSol(balance)}`
      );
      await sleep(1000);
    }

    divider();

    const market = await program.account.config.fetch(marketPda);
    const vaultLamports = (await connection.getAccountInfo(marketVault)).lamports;

    section("Betting Summary");
    row("Total staked on Magnus (X)", formatSol(market.totalBetsX.toNumber()));
    row("Total staked on Hikaru (Y)", formatSol(market.totalBetsY.toNumber()));
    row("Total vault balance",        formatSol(vaultLamports));
    divider();
  });

  it("Resolves the market (Magnus X wins)", async () => {
    await sleep(5000);

    await program.methods
      .resolve(true)
      .accountsPartial({
        signer:  personalWallet.publicKey,
        market:  marketPda,
        vault:   marketVault,
        treasury: personalWallet.publicKey,
        playerA: player1.publicKey,
        playerB: player2.publicKey,
      })
      .signers([personalWallet])
      .rpc();

    const marketData     = await program.account.config.fetch(marketPda);
    const vault          = await connection.getAccountInfo(marketVault);
    const player1Balance = await connection.getBalance(player1.publicKey);
    const player2Balance = await connection.getBalance(player2.publicKey);

    header("MARKET RESOLVED");
    section("Resolution State");
    row("Winner",               "Magnus Carlsen (X)");
    row("Is Resolved",          String(marketData.isResolved));
    row("Collected Fees",       formatSol(marketData.collectedFees.toNumber()));
    row("Distributable Amount", formatSol(marketData.distributableAmount.toNumber()));
    row("Vault Remaining",      formatSol(vault?.lamports ?? 0));
    divider();
    section("Player Payouts  (7% winner / 3% loser)");
    row("Player X  Magnus  (winner)", formatSol(player1Balance));
    row("Player Y  Hikaru  (loser)",  formatSol(player2Balance));
    divider();
  });

  it("All bettors claim their payouts", async () => {
    const bettors = [
      { name: "Alice",   keypair: alice,   betOnX: true  },
      { name: "Bob",     keypair: bob,     betOnX: false },
      { name: "Charlie", keypair: charlie, betOnX: true  },
      { name: "Diana",   keypair: diana,   betOnX: false },
      { name: "Eve",     keypair: eve,     betOnX: false },
    ];

    header("CLAIM PAYOUTS");
    section("Claim Results");
    console.log(`  │  ${"Bettor".padEnd(12)} ${"Side".padEnd(14)} ${"Payout".padEnd(16)} Balance After`);
    console.log(`  │  ${"─".repeat(62)}`);

    for (const bettor of bettors) {
      const [userBetPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_bet"),
          bettor.keypair.publicKey.toBuffer(),
          marketPda.toBuffer(),
        ],
        program.programId
      );

      const balanceBefore = await connection.getBalance(bettor.keypair.publicKey);

      await program.methods
        .claim()
        .accountsPartial({
          signer:    bettor.keypair.publicKey,
          depositor: bettor.keypair.publicKey,
          market:    marketPda,
          vault:     marketVault,
          userBet:   userBetPda,
          treasury:  personalWallet.publicKey,
        })
        .signers([bettor.keypair])
        .rpc();

      const balanceAfter = await connection.getBalance(bettor.keypair.publicKey);
      const diff  = balanceAfter - balanceBefore;
      const side   = bettor.betOnX ? "Magnus (X)" : "Hikaru (Y)";
      const payout = diff > 0 ? `+${formatSol(diff)}` : formatSol(0);

      console.log(
        `  │  ${pad(bettor.name, 12)} ${pad(side, 14)} ${pad(payout, 16)} ${formatSol(balanceAfter)}`
      );
    }

    divider();

    const vault      = await connection.getAccountInfo(marketVault);
    const marketData = await program.account.config.fetch(marketPda);

    section("Final Market State");
    row("Vault Remaining",      formatSol(vault?.lamports ?? 0));
    row("Distributable Amount", formatSol(marketData.distributableAmount.toNumber()));
    row("Collected Fees",       formatSol(marketData.collectedFees.toNumber()));
    divider();
  });

  it("Drains all accounts back to personal wallet", async () => {
    header("DRAINING ACCOUNTS TO PERSONAL WALLET");

    const accounts = [
      { name: "Alice",   kp: alice   },
      { name: "Bob",     kp: bob     },
      { name: "Charlie", kp: charlie },
      { name: "Diana",   kp: diana   },
      { name: "Eve",     kp: eve     },
      { name: "Player1", kp: player1 },
      { name: "Player2", kp: player2 },
    ];

    section("Drain Results");
    console.log(`  │  ${"Account".padEnd(12)} ${"Address".padEnd(16)} ${"Drained".padEnd(16)} Remaining`);
    console.log(`  │  ${"─".repeat(62)}`);

    let totalDrained = 0;
    for (const acc of accounts) {
      const drained = await drainAccount(connection, acc.kp, personalWallet.publicKey);
      const remaining = await connection.getBalance(acc.kp.publicKey);
      totalDrained += drained;
      console.log(
        `  │  ${pad(acc.name, 12)} ${pad(shortKey(acc.kp.publicKey), 16)} ${pad(formatSol(drained), 16)} ${formatSol(remaining)}`
      );
    }

    divider();

    const personalBalance = await connection.getBalance(personalWallet.publicKey);
    section("Personal Wallet After Drain");
    row("Address",        shortKey(personalWallet.publicKey));
    row("Total Drained",  formatSol(totalDrained));
    row("Final Balance",  formatSol(personalBalance));
    divider();
  });
});
