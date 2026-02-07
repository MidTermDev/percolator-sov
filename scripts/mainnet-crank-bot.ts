/**
 * SOV Mainnet Crank Bot
 *
 * Runs keeper crank at regular intervals to keep the market fresh.
 * Reads config from .env and sov-market.json.
 *
 * Usage: npx tsx scripts/mainnet-crank-bot.ts
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
import { encodeKeeperCrank } from "../packages/core/src/abi/instructions.js";
import { buildAccountMetas, ACCOUNTS_KEEPER_CRANK } from "../packages/core/src/abi/accounts.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";
import { parseEngine } from "../packages/core/src/solana/slab.js";

dotenv.config();

// Load config
const marketInfo = JSON.parse(fs.readFileSync("sov-market.json", "utf-8"));
const PROGRAM_ID = new PublicKey(marketInfo.programId);
const SLAB = new PublicKey(marketInfo.slab);

// For admin oracle, the oracle account can be the slab itself
const ORACLE = marketInfo.oracle ? new PublicKey(marketInfo.oracle) : SLAB;

const CRANK_INTERVAL_MS = 5_000; // 5 seconds
const PRIORITY_FEE = 50_000; // microlamports per CU

// Load keypair
const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) throw new Error("RPC_URL not set in .env");

const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "./admin-keypair.json";
const raw = fs.readFileSync(keypairPath, "utf-8");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
const connection = new Connection(rpcUrl, "confirmed");

async function runCrank(): Promise<{ signature: string; insurance: string }> {
  const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
  const keys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
    payer.publicKey,
    SLAB,
    SYSVAR_CLOCK_PUBKEY,
    ORACLE,
  ]);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.add(buildIx({ programId: PROGRAM_ID, keys, data: crankData }));

  const signature = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
    skipPreflight: true,
  });

  // Read insurance fund balance
  const info = await connection.getAccountInfo(SLAB);
  let insurance = "unknown";
  if (info) {
    try {
      const engine = parseEngine(Buffer.from(info.data));
      insurance = engine.insuranceFund.balance.toString();
    } catch {
      // ignore parse errors
    }
  }

  return { signature, insurance };
}

async function main() {
  console.log("SOV Mainnet Crank Bot\n");
  console.log(`Program:  ${PROGRAM_ID.toBase58()}`);
  console.log(`Slab:     ${SLAB.toBase58()}`);
  console.log(`Oracle:   ${ORACLE.toBase58()}`);
  console.log(`Payer:    ${payer.publicKey.toBase58()}`);
  console.log(`Interval: ${CRANK_INTERVAL_MS / 1000}s\n`);

  let crankCount = 0;
  let errorCount = 0;

  while (true) {
    try {
      const { signature, insurance } = await runCrank();
      crankCount++;
      console.log(
        `[${new Date().toISOString()}] Crank #${crankCount} OK: ${signature.slice(0, 16)}... | Insurance: ${insurance}`
      );
    } catch (err: any) {
      errorCount++;
      console.error(
        `[${new Date().toISOString()}] Crank failed (${errorCount}): ${err.message}`
      );
    }

    await new Promise((r) => setTimeout(r, CRANK_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
