/**
 * Try fix: push oracle price using SLOT NUMBER as timestamp instead of Unix time.
 * The program might store authority_timestamp in an engine field used as a slot reference.
 */
import {
  Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

import { encodeKeeperCrank, encodePushOraclePrice } from "../src/abi/instructions.js";
import { buildAccountMetas, ACCOUNTS_KEEPER_CRANK, ACCOUNTS_PUSH_ORACLE_PRICE } from "../src/abi/accounts.js";
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
  const currentSlot = await connection.getSlot();
  console.log("Current slot:", currentSlot);
  console.log("Current time:", Math.floor(Date.now() / 1000));

  // Test A: Push price with SLOT as timestamp, then crank
  console.log("\n=== Test A: Push with slot as timestamp ===");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    // Use slot number instead of unix timestamp
    const pushData = encodePushOraclePrice({ priceE6: "1000000", timestamp: currentSlot.toString() });
    const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));

    const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
    const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

    await simulate("Push(slot) + Crank", tx);
  }

  // Test B: Push price with timestamp=0, then crank
  console.log("\n=== Test B: Push with timestamp=0 ===");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    const pushData = encodePushOraclePrice({ priceE6: "1000000", timestamp: "0" });
    const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));

    const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
    const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

    await simulate("Push(0) + Crank", tx);
  }

  // Test C: Push price with timestamp=1 (minimal), then crank
  console.log("\n=== Test C: Push with timestamp=1 ===");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    const pushData = encodePushOraclePrice({ priceE6: "1000000", timestamp: "1" });
    const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));

    const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
    const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

    await simulate("Push(1) + Crank", tx);
  }
}

main().catch(console.error);
