/**
 * Test: can we run two consecutive cranks on the new empty market?
 */
import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

import { encodeKeeperCrank, encodePushOraclePrice } from "../packages/core/src/abi/instructions.js";
import { buildAccountMetas, ACCOUNTS_KEEPER_CRANK, ACCOUNTS_PUSH_ORACLE_PRICE } from "../packages/core/src/abi/accounts.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";
import { parseEngine } from "../packages/core/src/solana/slab.js";

const PROGRAM_ID = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
// V2 slab (created in setup-sov-v2.ts)
const SLAB = new PublicKey("687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc");
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
  console.log("Slab:", SLAB.toBase58());

  // Dump engine state
  const info = await connection.getAccountInfo(SLAB);
  if (info) {
    const engine = parseEngine(info.data);
    console.log("\nEngine state:");
    console.log("  lastCrankSlot:", engine.lastCrankSlot.toString());
    console.log("  numUsedAccounts:", engine.numUsedAccounts);
    console.log("  vault:", engine.vault.toString());
    console.log("  cTot:", engine.cTot.toString());

    const base = 392;
    const field224 = info.data.readBigInt64LE(base + 224);
    console.log("  engine[+224]:", field224.toString());
  }

  const now = Math.floor(Date.now() / 1000);

  // Test 1: Crank only (already cranked once during setup)
  console.log("\n=== Test 1: Crank only (no push) ===");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]),
      data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
    }));
    await simulate("Crank only", tx);
  }

  // Test 2: Push + Crank
  console.log("\n=== Test 2: Push + Crank ===");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]),
      data: encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() }),
    }));
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]),
      data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
    }));
    await simulate("Push + Crank", tx);
  }
}

main().catch(console.error);
