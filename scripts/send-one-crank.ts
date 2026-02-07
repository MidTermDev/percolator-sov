/**
 * Send a single push+crank transaction to mainnet (real, not simulated)
 */
import {
  Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY, sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

import { encodeKeeperCrank, encodePushOraclePrice } from "../packages/core/src/abi/instructions.js";
import { buildAccountMetas, ACCOUNTS_KEEPER_CRANK, ACCOUNTS_PUSH_ORACLE_PRICE } from "../packages/core/src/abi/accounts.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";

const market = JSON.parse(fs.readFileSync("sov-market.json", "utf-8"));
const PROGRAM_ID = new PublicKey(market.programId);
const SLAB = new PublicKey(market.slab);
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./admin-keypair.json", "utf-8"))));
const connection = new Connection(process.env.RPC_URL || "", "confirmed");

async function main() {
  const now = Math.floor(Date.now() / 1000);
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

  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
    skipPreflight: true,
  });
  console.log("Crank TX confirmed:", sig);
}

main().catch(console.error);
