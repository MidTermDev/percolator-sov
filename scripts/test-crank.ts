import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

import { encodeKeeperCrank, encodePushOraclePrice } from "../packages/core/src/abi/instructions.js";
import { buildAccountMetas, ACCOUNTS_KEEPER_CRANK, ACCOUNTS_PUSH_ORACLE_PRICE } from "../packages/core/src/abi/accounts.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";

const PROGRAM_ID = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
const SLAB = new PublicKey("AdqY3YniKDY5vFtiUzGpnm7SgjcqVoZD8QvHjinhhNYB");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./admin-keypair.json", "utf-8"))));
const connection = new Connection(process.env.RPC_URL || "", "confirmed");

async function test() {
  console.log("Pushing oracle price...");
  try {
    const now = Math.floor(Date.now() / 1000);
    const data = encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() });
    const keys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
    tx.add(buildIx({ programId: PROGRAM_ID, keys, data }));
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    console.log("Price push OK:", sig.slice(0, 20));
  } catch (e: any) {
    console.error("Price push FAILED:");
    if (e.logs) console.error(e.logs);
    else console.error(e.message);
  }

  console.log("\nRunning crank...");
  try {
    const data = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
    const keys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]);
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
    tx.add(buildIx({ programId: PROGRAM_ID, keys, data }));
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed", skipPreflight: true });
    console.log("Crank OK:", sig.slice(0, 20));
  } catch (e: any) {
    console.error("Crank FAILED:");
    if (e.logs) console.error(e.logs);
    else console.error(e.message);
  }
}
test();
