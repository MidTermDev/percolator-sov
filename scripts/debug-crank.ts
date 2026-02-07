/**
 * Debug crank: try multiple approaches to find what works
 */
import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
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

async function simulate(label: string, tx: Transaction) {
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sim = await connection.simulateTransaction(tx);
  console.log(`\n--- ${label} ---`);
  console.log("  Error:", JSON.stringify(sim.value.err));
  console.log("  CU used:", sim.value.unitsConsumed);
  for (const log of sim.value.logs || []) {
    console.log("  ", log);
  }
  return sim;
}

async function test() {
  const now = Math.floor(Date.now() / 1000);

  // Test 1: Push price then crank (allowPanic=false, callerIdx=65535)
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

    await simulate("Push + Crank (allowPanic=false)", tx);
  }

  // Test 2: Push price then crank (allowPanic=TRUE)
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    const pushData = encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() });
    const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));

    const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: true });
    const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

    await simulate("Push + Crank (allowPanic=TRUE)", tx);
  }

  // Test 3: Crank only (no price push, allowPanic=false)
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
    const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

    await simulate("Crank only (no push, allowPanic=false)", tx);
  }

  // Test 4: Crank with callerIdx=0 (the LP account)
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    const pushData = encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() });
    const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));

    const crankData = encodeKeeperCrank({ callerIdx: 0, allowPanic: false });
    const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

    await simulate("Push + Crank (callerIdx=0/LP)", tx);
  }

  // Test 5: Check raw bytes at suspicious offset to understand the field
  const info = await connection.getAccountInfo(SLAB);
  if (info) {
    const base = 392; // ENGINE_OFF
    // Read bytes 216-240 relative to engine
    const bytes = info.data.subarray(base + 216, base + 250);
    console.log("\n--- Raw engine bytes at funding area ---");
    console.log("  [216..223] lastFundingSlot:", info.data.readBigUInt64LE(base + 216).toString());
    console.log("  [224..231] 'fundingRate':", info.data.readBigInt64LE(base + 224).toString(), "(hex:", Buffer.from(info.data.subarray(base + 224, base + 232)).toString("hex"), ")");
    console.log("  [232..239] lastCrankSlot:", info.data.readBigUInt64LE(base + 232).toString());

    // Also check: what's 8 bytes BEFORE our expected engine start?
    // If ENGINE_OFF is really 384, our field at "224" would actually be at true offset 216
    const trueBase = 384;
    console.log("\n--- If ENGINE_OFF were 384: ---");
    console.log("  [224..231] would be:", info.data.readBigInt64LE(trueBase + 224).toString());
    console.log("  [232..239] would be:", info.data.readBigInt64LE(trueBase + 232).toString());
    console.log("  [240..247] would be:", info.data.readBigInt64LE(trueBase + 240).toString());
  }
}

test().catch(console.error);
