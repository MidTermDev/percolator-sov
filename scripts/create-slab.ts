/**
 * Create slab account only (Step 1 of mainnet setup)
 *
 * Creates the ~993KB slab account owned by the percolator program.
 * Saves the slab keypair to slab-keypair.json for later use.
 *
 * Usage: npx tsx scripts/create-slab.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
const SLAB_SIZE = 992_560;
const PRIORITY_FEE = 50_000;

function loadKeypair(path: string): Keypair {
  const resolved = path.startsWith("~/")
    ? path.replace("~", process.env.HOME || "")
    : path;
  const raw = fs.readFileSync(resolved, "utf-8");
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function main() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL not set in .env");

  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "./admin-keypair.json";
  const payer = loadKeypair(keypairPath);
  const connection = new Connection(rpcUrl, "confirmed");

  console.log(`Admin: ${payer.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  const rentExempt = await connection.getMinimumBalanceForRentExemption(SLAB_SIZE);
  console.log(`Slab rent: ${(rentExempt / 1e9).toFixed(4)} SOL`);

  if (balance < rentExempt + 10_000_000) {
    throw new Error(`Insufficient SOL. Need ~${((rentExempt + 10_000_000) / 1e9).toFixed(4)} SOL, have ${(balance / 1e9).toFixed(4)}`);
  }

  const slab = Keypair.generate();
  console.log(`\nSlab pubkey: ${slab.publicKey.toBase58()}`);

  // Save slab keypair for later use in setup
  fs.writeFileSync("slab-keypair.json", JSON.stringify(Array.from(slab.secretKey)));
  console.log("Saved slab keypair to slab-keypair.json");

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: slab.publicKey,
      lamports: rentExempt,
      space: SLAB_SIZE,
      programId: PROGRAM_ID,
    })
  );

  console.log("\nSending transaction...");
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, slab], { commitment: "confirmed" });
  console.log(`Confirmed: ${sig}`);
  console.log(`\n✓ Slab created: ${slab.publicKey.toBase58()}`);
  console.log(`\nSet this as NEXT_PUBLIC_SLAB_ADDRESS in your Vercel env vars.`);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
