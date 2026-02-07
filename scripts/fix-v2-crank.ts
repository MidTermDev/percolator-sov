/**
 * Fix V2 slab: reset corrupted authority_timestamp by re-setting oracle authority,
 * then push price + crank to verify the fix.
 */
import {
  Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY, sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

import {
  encodeKeeperCrank, encodePushOraclePrice, encodeSetOracleAuthority,
} from "../packages/core/src/abi/instructions.js";
import {
  buildAccountMetas,
  ACCOUNTS_KEEPER_CRANK, ACCOUNTS_PUSH_ORACLE_PRICE, ACCOUNTS_SET_ORACLE_AUTHORITY,
} from "../packages/core/src/abi/accounts.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";

const PROGRAM_ID = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
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
  const now = Math.floor(Date.now() / 1000);
  console.log("Admin:", payer.publicKey.toBase58());
  console.log("Slab:", SLAB.toBase58());

  // Step 1: Simulate SetOracleAuthority (re-set to same admin) to reset authority_timestamp
  // Then PushOraclePrice + KeeperCrank in a single tx
  console.log("\n=== Step 1: Reset oracle authority + Push + Crank (simulate) ===");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    // Reset authority_timestamp to 0 by re-setting oracle authority
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [payer.publicKey, SLAB]),
      data: encodeSetOracleAuthority({ newAuthority: payer.publicKey }),
    }));

    // Push fresh price
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]),
      data: encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() }),
    }));

    // Crank
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]),
      data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
    }));

    const ok = await simulate("ResetOracle + Push + Crank", tx);
    if (!ok) {
      console.log("\nSimulation failed, aborting.");
      return;
    }
  }

  // Step 2: Send it for real
  console.log("\n=== Step 2: Sending transaction for real ===");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [payer.publicKey, SLAB]),
      data: encodeSetOracleAuthority({ newAuthority: payer.publicKey }),
    }));

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

    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    console.log("  TX confirmed:", sig);
  }

  // Step 3: Verify with a second crank
  console.log("\n=== Step 3: Second crank (the one that always failed before) ===");
  await new Promise(r => setTimeout(r, 2000));
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));

    const now2 = Math.floor(Date.now() / 1000);
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]),
      data: encodePushOraclePrice({ priceE6: "1000000", timestamp: now2.toString() }),
    }));

    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]),
      data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
    }));

    const ok = await simulate("Second Push + Crank", tx);
    if (ok) {
      console.log("\n✓ SECOND CRANK SUCCEEDED! The fix works!");
    } else {
      console.log("\n✗ Second crank still failing.");
    }
  }
}

main().catch(console.error);
