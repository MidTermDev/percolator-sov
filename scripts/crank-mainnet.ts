/**
 * Mainnet keeper crank bot for SOV market
 *
 * Pushes oracle price + cranks in a single transaction (admin oracle mode).
 *
 * Usage: npx tsx scripts/crank-mainnet.ts
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
import {
  encodeKeeperCrank,
  encodePushOraclePrice,
} from "../packages/core/src/abi/instructions.js";
import {
  buildAccountMetas,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_PUSH_ORACLE_PRICE,
} from "../packages/core/src/abi/accounts.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";

dotenv.config();

const marketInfo = JSON.parse(fs.readFileSync("sov-market.json", "utf-8"));
const PROGRAM_ID = new PublicKey(marketInfo.programId);
const SLAB = new PublicKey(marketInfo.slab);

const CRANK_INTERVAL_MS = 5000;
const PRIORITY_FEE = 50_000;

const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "./admin-keypair.json";
const raw = fs.readFileSync(keypairPath, "utf-8");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
const connection = new Connection(process.env.RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

async function pushAndCrank(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Push oracle price
  const pushData = encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() });
  const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);

  // Keeper crank
  const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
  const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
    payer.publicKey,
    SLAB,
    SYSVAR_CLOCK_PUBKEY,
    SLAB, // admin oracle: oracle account = slab
  ]);

  // Combine into single tx: push price THEN crank
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));
  tx.add(buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));
  tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

  return await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
    skipPreflight: true,
  });
}

async function main() {
  console.log("SOV Mainnet Crank Bot\n");
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Slab: ${SLAB.toBase58()}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);
  console.log(`Cranking every ${CRANK_INTERVAL_MS / 1000}s (push+crank combined)...\n`);

  let crankCount = 0;
  let errorCount = 0;

  while (true) {
    try {
      const sig = await pushAndCrank();
      crankCount++;
      console.log(`[${new Date().toISOString()}] Crank #${crankCount} OK: ${sig.slice(0, 16)}...`);
    } catch (err: any) {
      errorCount++;
      const msg = err.logs ? err.logs.join("\n  ") : err.message?.slice(0, 200) || String(err);
      console.error(`[${new Date().toISOString()}] Error (${errorCount}):\n  ${msg}`);
    }

    await new Promise((r) => setTimeout(r, CRANK_INTERVAL_MS));
  }
}

main().catch(console.error);
