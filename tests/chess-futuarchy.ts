import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ChessFutuarchy } from "../target/types/chess_futuarchy";
import { getAssociatedTokenAddress } from "@solana/spl-token";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const formatSol = (lamports: number | bigint) =>
  (Number(lamports) / anchor.web3.LAMPORTS_PER_SOL).toFixed(4);

function printBox(title: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}`);
}

function printSection(content: string) {
  console.log(`  ${content}`);
}

function printDivider() {
  console.log(`${"─".repeat(70)}`);
}

describe("chess-futuarchy", () => {
  // Configure the client to use the local cluster.
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
    // Generate test keypairs for users
    alice = anchor.web3.Keypair.generate();
    bob = anchor.web3.Keypair.generate();
    charlie = anchor.web3.Keypair.generate();
    diana = anchor.web3.Keypair.generate();
    eve = anchor.web3.Keypair.generate();

    // Airdrop SOL to test accounts
    await airdropSol(
      [
        alice.publicKey,
        bob.publicKey,
        charlie.publicKey,
        diana.publicKey,
        eve.publicKey,
      ],
      10 * anchor.web3.LAMPORTS_PER_SOL, // Airdrop 2 SOL to each account
    );

    // Generate keypairs for players
    player1 = anchor.web3.Keypair.generate();
    player2 = anchor.web3.Keypair.generate();

    // Airdrop SOL to player accounts
    await airdropSol(
      [player1.publicKey, player2.publicKey],
      2 * anchor.web3.LAMPORTS_PER_SOL, // Airdrop 2 SOL to each player account
    );

    // Initialize seed and fee
    seed = new anchor.BN(Date.now());
    fee = 300; // 5% fee

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
    const tx = await program.methods
      .initialize(
        seed,
        fee,
        new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL), // maxbet of 2 SOL
        new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL), // minbet of 0.1 SOL
        provider.wallet.publicKey, // fee recipient is the
        player1.publicKey, // player 1
        player2.publicKey, // player 2
        new anchor.BN(now + 1),
        new anchor.BN(now + 15),
        new anchor.BN(now + 19),
      )
      .accountsPartial({
        signer: provider.wallet.publicKey,
      })
      .rpc();

    printBox("🎯 MATCH CREATED: Magnus Carlsen (X) vs Hikaru Nakamura (Y)");
    printSection(`Fee: ${fee / 100}% | Min Bet: 0.1 SOL | Max Bet: 2 SOL`);
    printSection(`⏳ Market opens in 1 seconds...`);
    console.log(`${"=".repeat(70)}\n`);
  });

  it("Allows users to place bets", async () => {
    // Wait for market to open
    await sleep(1500);

    const bets = [
      {
        name: "Alice",
        keypair: alice,
        amount: 0.5,
        player: "Magnus (X)",
        outcome: 0,
      },
      {
        name: "Bob",
        keypair: bob,
        amount: 0.3,
        player: "Hikaru (Y)",
        outcome: 1,
      },
      {
        name: "Charlie",
        keypair: charlie,
        amount: 0.8,
        player: "Magnus (X)",
        outcome: 0,
      },
      {
        name: "Diana",
        keypair: diana,
        amount: 0.5,
        player: "Hikaru (Y)",
        outcome: 1,
      },
      {
        name: "Eve",
        keypair: eve,
        amount: 1.0,
        player: "Hikaru (Y)",
        outcome: 1,
      },
    ];

    for (const bet of bets) {
      await program.methods
        .deposit(
          new anchor.BN(bet.amount * anchor.web3.LAMPORTS_PER_SOL),
          bet.outcome == 0,
        )
        .accountsPartial({
          depositor: bet.keypair.publicKey,
          market: marketPda,
          vault: marketVault,
        })
        .signers([bet.keypair])
        .rpc();

      printSection(
        `${bet.name.padEnd(12)} deposited ${bet.amount.toFixed(1)} SOL on ${
          bet.player
        }`,
      );
      await sleep(1500); // Simulate time between each bet
    }

    // timestampBettingEnd = Date.now();

    const market = await program.account.config.fetch(marketPda);
    const totalX = market.totalBetsX.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    const totalY = market.totalBetsY.toNumber() / anchor.web3.LAMPORTS_PER_SOL;

    const vaultState =
      (await provider.connection.getAccountInfo(marketVault)).lamports /
      anchor.web3.LAMPORTS_PER_SOL;

    printBox("📊 BETTING SUMMARY");
    printBox(`Total Bets on Magnus (X): ${totalX.toFixed(1)} SOL`);
    printBox(`Total Bets on Hikaru (Y): ${totalY.toFixed(1)} SOL`);

    printBox(`Vault Balance: ${vaultState.toFixed(4)} SOL`);
  });

  it("Allows oracle to resolve the market", async () => {
    // Wait for market to resolve
    await sleep(5000);

    // Simulate oracle resolution (Hikaru wins)
    await program.methods
      .resolve(true) // Outcome 1 = Hikaru wins
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

    printBox("🏁 MATCH RESULT: Hikaru Nakamura (Y) wins!");

    const market = await provider.connection.getAccountInfo(marketPda);
    const vault = await provider.connection.getAccountInfo(marketVault);

    printSection(`Market State: ${market ? "Resolved" : "Unknown"}`);
    printSection(
      `Vault Balance after resolution: ${formatSol(vault?.lamports || 0)} SOL`,
    );

    const aliceBalance = await provider.connection.getBalance(alice.publicKey);
    const bobBalance = await provider.connection.getBalance(bob.publicKey);
    const charlieBalance = await provider.connection.getBalance(
      charlie.publicKey,
    );
    const dianaBalance = await provider.connection.getBalance(diana.publicKey);
    const eveBalance = await provider.connection.getBalance(eve.publicKey);

    printBox("💰 FINAL BALANCES");
    printSection(`Alice: ${formatSol(aliceBalance)} SOL`);
    printSection(`Bob: ${formatSol(bobBalance)} SOL`);
    printSection(`Charlie: ${formatSol(charlieBalance)} SOL`);
    printSection(`Diana: ${formatSol(dianaBalance)} SOL`);
    printSection(`Eve: ${formatSol(eveBalance)} SOL`);

    const marketData = await program.account.config.fetch(marketPda);

    console.log(`\n${"=".repeat(70)}`);
    console.log(`  🧾 MARKET ACCOUNT DATA`);
    console.log(`${"=".repeat(70)}`);
    console.log(`Seed: ${marketData.seed.toString()}`);
    console.log(`Fee: ${marketData.fee}%`);
    console.log(
      `Total Bets on Magnus (X): ${formatSol(
        marketData.totalBetsX.toNumber(),
      )} SOL`,
    );
    console.log(
      `Total Bets on Hikaru (Y): ${formatSol(
        marketData.totalBetsY.toNumber(),
      )} SOL`,
    );
  });

  it("Allows bettors to claim their payouts", async () => {
    const bettors = [
      { name: "Alice", keypair: alice, betOnX: true },
      { name: "Bob", keypair: bob, betOnX: false },
      { name: "Charlie", keypair: charlie, betOnX: true },
      { name: "Diana", keypair: diana, betOnX: false },
      { name: "Eve", keypair: eve, betOnX: false },
    ];

    printBox("💸 CLAIMING PAYOUTS");

    for (const bettor of bettors) {
      const [userBetPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_bet"),
          bettor.keypair.publicKey.toBuffer(),
          marketPda.toBuffer(),
        ],
        program.programId,
      );

      const balanceBefore = await provider.connection.getBalance(
        bettor.keypair.publicKey,
      );

      await program.methods
        .claim()
        .accountsPartial({
          signer: bettor.keypair.publicKey,
          depositor: bettor.keypair.publicKey,
          market: marketPda,
          vault: marketVault,
          userBet: userBetPda,
          treasury: provider.wallet.publicKey,
        })
        .signers([bettor.keypair])
        .rpc();

      const balanceAfter = await provider.connection.getBalance(
        bettor.keypair.publicKey,
      );
      const diff = balanceAfter - balanceBefore;

      printSection(
        `${bettor.name.padEnd(12)} | ${bettor.betOnX ? "Magnus (X)" : "Hikaru (Y)"} | ${diff > 0 ? "+" : ""}${formatSol(diff)} SOL`,
      );
    }

    const vault = await provider.connection.getAccountInfo(marketVault);
    printDivider();
    printSection(
      `Vault Balance after claims: ${formatSol(vault?.lamports || 0)} SOL`,
    );
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
