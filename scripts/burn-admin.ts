/**
 * Burn Admin Key
 *
 * Transfers admin authority to the system program (dead address).
 * This is IRREVERSIBLE - fees are locked forever, no more config changes.
 *
 * Prerequisites:
 *   - Oracle authority must already be disabled (set to zero pubkey)
 *   - Must review all current config before proceeding
 *
 * Usage: npx tsx scripts/burn-admin.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import * as fs from "fs";
import * as readline from "readline";
import * as dotenv from "dotenv";
import { encodeUpdateAdmin } from "../packages/core/src/abi/instructions.js";
import { ACCOUNTS_UPDATE_ADMIN, buildAccountMetas } from "../packages/core/src/abi/accounts.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";
import {
  parseHeader,
  parseConfig,
  parseEngine,
  parseParams,
} from "../packages/core/src/solana/slab.js";

dotenv.config();

const DEAD_ADDRESS = new PublicKey("11111111111111111111111111111111");
const ZERO_PUBKEY = new PublicKey("11111111111111111111111111111111");

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("⚠️  BURN ADMIN KEY - IRREVERSIBLE OPERATION");
  console.log("=".repeat(70));

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL not set in .env");

  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "./admin-keypair.json";
  const raw = fs.readFileSync(keypairPath, "utf-8");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  const connection = new Connection(rpcUrl, "confirmed");

  const marketInfo = JSON.parse(fs.readFileSync("sov-market.json", "utf-8"));
  const PROGRAM_ID = new PublicKey(marketInfo.programId);
  const SLAB = new PublicKey(marketInfo.slab);

  // Fetch and display current state
  console.log("\nFetching current market state...\n");
  const info = await connection.getAccountInfo(SLAB);
  if (!info) throw new Error("Slab account not found");

  const data = Buffer.from(info.data);
  const header = parseHeader(data);
  const config = parseConfig(data);
  const engine = parseEngine(data);
  const params = parseParams(data);

  console.log("CURRENT CONFIGURATION:");
  console.log("-".repeat(40));
  console.log(`Admin:              ${header.admin.toBase58()}`);
  console.log(`Slab:               ${SLAB.toBase58()}`);
  console.log(`Collateral Mint:    ${config.collateralMint.toBase58()}`);
  console.log(`Inverted:           ${config.invert === 1 ? "Yes" : "No"}`);
  console.log(`Oracle Authority:   ${config.oracleAuthority.toBase58()}`);
  console.log(`Vault:              ${config.vaultPubkey.toBase58()}`);
  console.log(`Trading Fee:        ${Number(params.tradingFeeBps)} bps`);
  console.log(`Maintenance Margin: ${Number(params.maintenanceMarginBps)} bps`);
  console.log(`Initial Margin:     ${Number(params.initialMarginBps)} bps`);
  console.log(`Insurance Fund:     ${engine.insuranceFund.balance}`);
  console.log(`Fee Revenue:        ${engine.insuranceFund.feeRevenue}`);
  console.log(`Vault Balance:      ${engine.vault}`);
  console.log(`Total OI:           ${engine.totalOpenInterest}`);
  console.log(`Accounts Used:      ${engine.numUsedAccounts}`);
  console.log("-".repeat(40));

  // Check prerequisite: oracle authority should be disabled
  const oracleIsZero =
    config.oracleAuthority.toBase58() === ZERO_PUBKEY.toBase58() ||
    config.oracleAuthority.toBase58() === "11111111111111111111111111111111";

  if (!oracleIsZero) {
    console.log("\n⚠️  WARNING: Oracle authority is still active!");
    console.log(`   Current: ${config.oracleAuthority.toBase58()}`);
    console.log("   You should disable oracle authority before burning admin key.");
    console.log("   Otherwise, admin oracle prices can never be updated.\n");

    const proceed = await ask("Continue anyway? (yes/no): ");
    if (proceed.toLowerCase() !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  // Final confirmation
  console.log("\n⚠️  This will transfer admin authority to:");
  console.log(`   ${DEAD_ADDRESS.toBase58()}`);
  console.log("\n   This is IRREVERSIBLE. After this:");
  console.log("   - No config changes possible");
  console.log("   - No fee parameter updates");
  console.log("   - Insurance fund fees locked forever");
  console.log("   - Circulating supply only decreases\n");

  const confirm1 = await ask("Type 'BURN' to proceed: ");
  if (confirm1 !== "BURN") {
    console.log("Aborted.");
    process.exit(0);
  }

  const confirm2 = await ask("Are you absolutely sure? Type 'YES' to confirm: ");
  if (confirm2 !== "YES") {
    console.log("Aborted.");
    process.exit(0);
  }

  // Execute burn
  console.log("\nBurning admin key...");
  const ixData = encodeUpdateAdmin({ newAdmin: DEAD_ADDRESS });
  const keys = buildAccountMetas(ACCOUNTS_UPDATE_ADMIN, [
    payer.publicKey,
    SLAB,
  ]);

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }));
  tx.add(buildIx({ programId: PROGRAM_ID, keys, data: ixData }));

  const signature = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "finalized",
  });

  console.log(`\nAdmin key burned. Signature: ${signature}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${signature}`);

  // Verify
  const finalInfo = await connection.getAccountInfo(SLAB);
  if (finalInfo) {
    const finalHeader = parseHeader(Buffer.from(finalInfo.data));
    console.log(`\nNew admin: ${finalHeader.admin.toBase58()}`);
    if (finalHeader.admin.toBase58() === DEAD_ADDRESS.toBase58()) {
      console.log("Admin key successfully burned. The SOV vault is now immutable.");
    }
  }

  console.log("\n" + "=".repeat(70));
}

main().catch(console.error);
