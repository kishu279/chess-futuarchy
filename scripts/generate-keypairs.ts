import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, "../keypairs/devnet.json");

const names = ["alice", "bob", "charlie", "diana", "eve", "player1", "player2"];

const existing = fs.existsSync(OUTPUT_FILE)
  ? JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"))
  : {};

const result: Record<string, { publicKey: string; secretKey: number[] }> = {};

for (const name of names) {
  if (existing[name]) {
    console.log(`  ${name.padEnd(12)} [exists] ${existing[name].publicKey}`);
    result[name] = existing[name];
  } else {
    const kp = anchor.web3.Keypair.generate();
    result[name] = {
      publicKey: kp.publicKey.toBase58(),
      secretKey: Array.from(kp.secretKey),
    };
    console.log(`  ${name.padEnd(12)} [new]    ${result[name].publicKey}`);
  }
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
console.log(`\nSaved to ${OUTPUT_FILE}`);
