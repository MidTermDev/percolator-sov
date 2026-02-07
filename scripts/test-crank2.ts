import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
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
  const now = Math.floor(Date.now() / 1000);

  const pushData = encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() });
  const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);

  const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
  // Try system program as dummy oracle (admin oracle mode ignores oracle account)
  const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
  const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SYSTEM_PROGRAM]);

  // Try crank ONLY (no price push) to isolate the error
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));
  tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

  // Simulate to get logs
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const sim = await connection.simulateTransaction(tx);
  console.log("Simulation result:");
  console.log("  Error:", JSON.stringify(sim.value.err));
  console.log("  Logs:");
  for (const log of sim.value.logs || []) {
    console.log("   ", log);
  }
}
test();
