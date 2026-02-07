/**
 * Setup SOV (Store of Value) market on mainnet
 *
 * Creates an inverted perpetual market with PERC as collateral.
 * Uses admin oracle mode (all-zero feed ID) for price feeds.
 *
 * Prerequisites:
 *   - .env with RPC_URL and ADMIN_KEYPAIR_PATH
 *   - Admin keypair funded with SOL for tx fees
 *   - Admin has PERC tokens for LP collateral + insurance fund
 *
 * Usage: npx tsx scripts/setup-mainnet-sov.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as dotenv from "dotenv";
import {
  encodeInitMarket,
  encodeInitLP,
  encodeDepositCollateral,
  encodeTopUpInsurance,
  encodeKeeperCrank,
  encodeSetOracleAuthority,
  encodePushOraclePrice,
} from "../packages/core/src/abi/instructions.js";
import {
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_TOPUP_INSURANCE,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_SET_ORACLE_AUTHORITY,
  ACCOUNTS_PUSH_ORACLE_PRICE,
  buildAccountMetas,
} from "../packages/core/src/abi/accounts.js";
import { deriveVaultAuthority, deriveLpPda } from "../packages/core/src/solana/pda.js";
import { parseHeader, parseConfig, parseEngine, parseUsedIndices } from "../packages/core/src/solana/slab.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";

dotenv.config();

// ============================================================================
// CONSTANTS
// ============================================================================

const PERC_MINT = new PublicKey("A16Gd8AfaPnG6rohE6iPFDf6mr9gk519d6aMUJAperc");

// Program ID - to be set after deployment
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "11111111111111111111111111111111");
const MATCHER_PROGRAM_ID = new PublicKey(process.env.MATCHER_PROGRAM_ID || "11111111111111111111111111111111");
const MATCHER_CTX_SIZE = 320;

// Slab size: ENGINE_OFF(392) + ENGINE_ACCOUNTS_OFF(9136) + MAX_ACCOUNTS(4096) * ACCOUNT_SIZE(240)
const SLAB_SIZE = 992_560;

// Priority fee (microlamports per CU)
const PRIORITY_FEE = 50_000;

// Funding amounts (PERC tokens - assuming 6 decimals)
const INSURANCE_FUND_AMOUNT = 1_000_000_000n;  // 1000 PERC
const LP_COLLATERAL_AMOUNT = 1_000_000_000n;   // 1000 PERC

// ============================================================================
// HELPERS
// ============================================================================

function loadKeypair(path: string): Keypair {
  const resolved = path.startsWith("~/")
    ? path.replace("~", process.env.HOME || "")
    : path;
  const raw = fs.readFileSync(resolved, "utf-8");
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function addPriorityFee(tx: Transaction): void {
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("PERCOLATOR SOV - MAINNET MARKET SETUP");
  console.log("=".repeat(70));

  // Load env
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL not set in .env");

  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "./admin-keypair.json";
  const payer = loadKeypair(keypairPath);
  const connection = new Connection(rpcUrl, "confirmed");

  console.log(`\nRPC: ${rpcUrl.replace(/api-key=.*/, "api-key=***")}`);
  console.log(`Admin: ${payer.publicKey.toBase58()}`);
  console.log(`PERC Mint: ${PERC_MINT.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);

  // Step 1: Load existing slab account (created by create-slab.ts)
  console.log("Step 1: Loading existing slab account...");
  const slabKpPath = "./slab-keypair.json";
  if (!fs.existsSync(slabKpPath)) throw new Error("slab-keypair.json not found. Run create-slab.ts first.");
  const slab = loadKeypair(slabKpPath);
  console.log(`  Slab: ${slab.publicKey.toBase58()}`);

  const slabCheck = await connection.getAccountInfo(slab.publicKey);
  if (!slabCheck) throw new Error("Slab account not found on-chain!");
  console.log(`  Slab exists on-chain (${slabCheck.data.length} bytes)`);

  // Steps 2-6 already completed. Derive vault addresses for later steps.
  console.log("\nSteps 2-6: Already completed. Deriving addresses...");
  const [vaultPda] = deriveVaultAuthority(PROGRAM_ID, slab.publicKey);
  console.log(`  Vault PDA: ${vaultPda.toBase58()}`);

  const vaultAccount = await getOrCreateAssociatedTokenAccount(
    connection, payer, PERC_MINT, vaultPda, true
  );
  const vault = vaultAccount.address;
  console.log(`  Vault ATA: ${vault.toBase58()}`);

  // Step 7: Create admin PERC ATA + LP
  console.log("\nStep 7: Setting up LP...");
  const adminAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, PERC_MINT, payer.publicKey
  );

  const slabInfo = await connection.getAccountInfo(slab.publicKey);
  const usedIndices = slabInfo ? parseUsedIndices(slabInfo.data) : [];
  const lpIndex = usedIndices.length;

  const matcherCtxKp = Keypair.generate();
  const matcherRent = await connection.getMinimumBalanceForRentExemption(MATCHER_CTX_SIZE);

  const createMatcherTx = new Transaction();
  addPriorityFee(createMatcherTx);
  createMatcherTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }));
  createMatcherTx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: matcherCtxKp.publicKey,
      lamports: matcherRent,
      space: MATCHER_CTX_SIZE,
      programId: MATCHER_PROGRAM_ID,
    })
  );
  await sendAndConfirmTransaction(connection, createMatcherTx, [payer, matcherCtxKp], {
    commitment: "confirmed",
  });

  const [lpPda] = deriveLpPda(PROGRAM_ID, slab.publicKey, lpIndex);

  // Initialize matcher context with vAMM Tag 2 (66 bytes)
  const initVammData = Buffer.alloc(66);
  {
    let off = 0;
    initVammData.writeUInt8(2, off); off += 1;         // Tag 2 = InitVamm
    initVammData.writeUInt8(0, off); off += 1;         // mode 0 = passive
    initVammData.writeUInt32LE(50, off); off += 4;     // tradingFeeBps = 50 (0.5%)
    initVammData.writeUInt32LE(50, off); off += 4;     // baseSpreadBps = 50 (0.5%)
    initVammData.writeUInt32LE(200, off); off += 4;    // maxTotalBps = 200 (2%)
    initVammData.writeUInt32LE(0, off); off += 4;      // impactKBps = 0 (passive)
    // liquidityNotionalE6 (u128) = 10M
    const liq = 10_000_000_000_000n;
    initVammData.writeBigUInt64LE(liq & 0xFFFFFFFFFFFFFFFFn, off); off += 8;
    initVammData.writeBigUInt64LE(liq >> 64n, off); off += 8;
    // maxFillAbs (u128) = 1M PERC
    const maxFill = 1_000_000_000_000n;
    initVammData.writeBigUInt64LE(maxFill & 0xFFFFFFFFFFFFFFFFn, off); off += 8;
    initVammData.writeBigUInt64LE(maxFill >> 64n, off); off += 8;
    // maxInventoryAbs (u128) = 0 (unlimited)
    initVammData.writeBigUInt64LE(0n, off); off += 8;
    initVammData.writeBigUInt64LE(0n, off); off += 8;
  }

  const initMatcherTx = new Transaction();
  addPriorityFee(initMatcherTx);
  initMatcherTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }));
  initMatcherTx.add({
    programId: MATCHER_PROGRAM_ID,
    keys: [
      { pubkey: lpPda, isSigner: false, isWritable: false },
      { pubkey: matcherCtxKp.publicKey, isSigner: false, isWritable: true },
    ],
    data: initVammData,
  });
  await sendAndConfirmTransaction(connection, initMatcherTx, [payer], { commitment: "confirmed" });

  // Initialize LP
  const initLpData = encodeInitLP({
    matcherProgram: MATCHER_PROGRAM_ID,
    matcherContext: matcherCtxKp.publicKey,
    feePayment: "2000000",
  });
  const initLpKeys = buildAccountMetas(ACCOUNTS_INIT_LP, [
    payer.publicKey,
    slab.publicKey,
    adminAta.address,
    vault,
    TOKEN_PROGRAM_ID,
  ]);

  const initLpTx = new Transaction();
  addPriorityFee(initLpTx);
  initLpTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  initLpTx.add(buildIx({ programId: PROGRAM_ID, keys: initLpKeys, data: initLpData }));
  await sendAndConfirmTransaction(connection, initLpTx, [payer], { commitment: "confirmed" });
  console.log(`  LP initialized at index ${lpIndex}`);

  // Deposit collateral to LP
  const depositData = encodeDepositCollateral({
    userIdx: lpIndex,
    amount: LP_COLLATERAL_AMOUNT.toString(),
  });
  const depositKeys = buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [
    payer.publicKey,
    slab.publicKey,
    adminAta.address,
    vault,
    TOKEN_PROGRAM_ID,
    SYSVAR_CLOCK_PUBKEY,
  ]);

  const depositTx = new Transaction();
  addPriorityFee(depositTx);
  depositTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  depositTx.add(buildIx({ programId: PROGRAM_ID, keys: depositKeys, data: depositData }));
  await sendAndConfirmTransaction(connection, depositTx, [payer], { commitment: "confirmed" });
  console.log(`  Deposited LP collateral`);

  // Step 8: Top up insurance fund
  console.log("\nStep 8: Topping up insurance fund...");
  const topupData = encodeTopUpInsurance({ amount: INSURANCE_FUND_AMOUNT.toString() });
  const topupKeys = buildAccountMetas(ACCOUNTS_TOPUP_INSURANCE, [
    payer.publicKey,
    slab.publicKey,
    adminAta.address,
    vault,
    TOKEN_PROGRAM_ID,
  ]);

  const topupTx = new Transaction();
  addPriorityFee(topupTx);
  topupTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  topupTx.add(buildIx({ programId: PROGRAM_ID, keys: topupKeys, data: topupData }));
  await sendAndConfirmTransaction(connection, topupTx, [payer], { commitment: "confirmed" });
  console.log("  Insurance fund topped up");

  // Verify final state
  console.log("\nStep 9: Verifying market state...");
  const finalSlabInfo = await connection.getAccountInfo(slab.publicKey);
  if (finalSlabInfo) {
    const header = parseHeader(finalSlabInfo.data);
    const config = parseConfig(finalSlabInfo.data);
    const engine = parseEngine(finalSlabInfo.data);

    console.log(`  Version: ${header.version}`);
    console.log(`  Admin: ${header.admin.toBase58()}`);
    console.log(`  Inverted: ${config.invert === 1 ? "Yes" : "No"}`);
    console.log(`  Oracle Authority: ${config.oracleAuthority.toBase58()}`);
    console.log(`  Insurance fund: ${engine.insuranceFund.balance}`);
  }

  // Save market info
  const marketInfo = {
    network: "mainnet",
    createdAt: new Date().toISOString(),
    programId: PROGRAM_ID.toBase58(),
    matcherProgramId: MATCHER_PROGRAM_ID.toBase58(),
    slab: slab.publicKey.toBase58(),
    mint: PERC_MINT.toBase58(),
    vault: vault.toBase58(),
    vaultPda: vaultPda.toBase58(),
    oracleMode: "admin",
    inverted: true,
    lp: {
      index: lpIndex,
      pda: lpPda.toBase58(),
      matcherContext: matcherCtxKp.publicKey.toBase58(),
    },
    admin: payer.publicKey.toBase58(),
    adminAta: adminAta.address.toBase58(),
  };

  fs.writeFileSync("sov-market.json", JSON.stringify(marketInfo, null, 2));
  console.log("\nMarket info saved to sov-market.json");

  console.log("\n" + "=".repeat(70));
  console.log("SOV MARKET SETUP COMPLETE");
  console.log("=".repeat(70));
  console.log(`\n  Slab: ${slab.publicKey.toBase58()}`);
  console.log(`  Mint: ${PERC_MINT.toBase58()}`);
  console.log(`  Vault: ${vault.toBase58()}`);
  console.log(`  LP Index: ${lpIndex}`);
  console.log(`  Admin: ${payer.publicKey.toBase58()}\n`);
}

main().catch(console.error);
