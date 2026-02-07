/**
 * Attempt to fix the crank by:
 * 1. Calling UpdateConfig to refresh funding params
 * 2. Pushing a fresh oracle price
 * 3. Attempting crank again
 */
import {
  Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY, sendAndConfirmTransaction
} from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

import {
  encodeUpdateConfig, encodeKeeperCrank, encodePushOraclePrice,
} from "../src/abi/instructions.js";
import {
  buildAccountMetas, ACCOUNTS_UPDATE_CONFIG, ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_PUSH_ORACLE_PRICE,
} from "../src/abi/accounts.js";
import { buildIx } from "../src/runtime/tx.js";

const PROGRAM_ID = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
const SLAB = new PublicKey("AdqY3YniKDY5vFtiUzGpnm7SgjcqVoZD8QvHjinhhNYB");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./admin-keypair.json", "utf-8"))));
const connection = new Connection(process.env.RPC_URL || "", "confirmed");

async function simulate(label: string, tx: Transaction): Promise<boolean> {
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sim = await connection.simulateTransaction(tx);
  console.log(`\n--- ${label} ---`);
  console.log("  Error:", JSON.stringify(sim.value.err));
  console.log("  CU:", sim.value.unitsConsumed);
  for (const log of sim.value.logs || []) console.log("  ", log);
  return sim.value.err === null;
}

async function main() {
  const now = Math.floor(Date.now() / 1000);

  // Step 1: Try UpdateConfig to refresh funding params
  console.log("=== Step 1: UpdateConfig ===");
  {
    const data = encodeUpdateConfig({
      fundingHorizonSlots: "500",
      fundingKBps: "100",
      fundingInvScaleNotionalE6: "1000000000000",
      fundingMaxPremiumBps: "500",
      fundingMaxBpsPerSlot: "5",
      threshFloor: "0",
      threshRiskBps: "50",
      threshUpdateIntervalSlots: "10",
      threshStepBps: "500",
      threshAlphaBps: "1000",
      threshMin: "0",
      threshMax: "10000000000000000000",
      threshMinStep: "1",
    });
    const keys = buildAccountMetas(ACCOUNTS_UPDATE_CONFIG, [payer.publicKey, SLAB]);
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
    tx.add(buildIx({ programId: PROGRAM_ID, keys, data }));
    const ok = await simulate("UpdateConfig", tx);
    if (ok) {
      console.log("  Sending UpdateConfig...");
      const { blockhash } = await connection.getLatestBlockhash();
      const sendTx = new Transaction();
      sendTx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
      sendTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
      sendTx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_UPDATE_CONFIG, [payer.publicKey, SLAB]), data }));
      const sig = await sendAndConfirmTransaction(connection, sendTx, [payer], { commitment: "confirmed" });
      console.log("  UpdateConfig confirmed:", sig.slice(0, 20));
    }
  }

  // Step 2: Push fresh oracle price
  console.log("\n=== Step 2: Push Oracle Price ===");
  {
    const data = encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() });
    const keys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
    tx.add(buildIx({ programId: PROGRAM_ID, keys, data }));
    const ok = await simulate("PushOraclePrice", tx);
    if (ok) {
      const sendTx = new Transaction();
      sendTx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
      sendTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
      sendTx.add(buildIx({ programId: PROGRAM_ID, keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]), data }));
      await sendAndConfirmTransaction(connection, sendTx, [payer], { commitment: "confirmed" });
      console.log("  Price pushed");
    }
  }

  // Step 3: Try crank again
  console.log("\n=== Step 3: Crank ===");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    const pushData = encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() });
    const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));

    const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
    const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

    await simulate("Push + Crank (after UpdateConfig)", tx);
  }
}

main().catch(console.error);
