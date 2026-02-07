/**
 * SOV Market V2 Setup — Complete from-scratch market creation
 *
 * Creates a fresh inverted perpetual market for SOV with:
 *   - 250M PERC LP liquidity
 *   - Admin oracle mode (price pushed by admin)
 *   - vAMM matcher (Tag 2 for mainnet matcher program)
 *
 * After LP setup, runs two consecutive cranks to verify crank stability.
 *
 * Usage: npx tsx scripts/setup-sov-v2.ts
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
  encodeUpdateConfig,
} from "../packages/core/src/abi/instructions.js";
import {
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_TOPUP_INSURANCE,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_SET_ORACLE_AUTHORITY,
  ACCOUNTS_PUSH_ORACLE_PRICE,
  ACCOUNTS_UPDATE_CONFIG,
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
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
const MATCHER_PROGRAM_ID = new PublicKey(process.env.MATCHER_PROGRAM_ID || "DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX");
const MATCHER_CTX_SIZE = 320;
const SLAB_SIZE = 992_560;
const PRIORITY_FEE = 50_000;

// Funding amounts (PERC with 6 decimals)
const LP_COLLATERAL_AMOUNT = 250_000_000_000_000n;  // 250M PERC
const INSURANCE_FUND_AMOUNT = 1_000_000_000n;        // 1000 PERC

// ============================================================================
// HELPERS
// ============================================================================

function loadKeypair(path: string): Keypair {
  const resolved = path.startsWith("~/") ? path.replace("~", process.env.HOME || "") : path;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf-8"))));
}

function addPriority(tx: Transaction, cuLimit: number): void {
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }));
}

async function send(connection: Connection, tx: Transaction, signers: Keypair[], label: string): Promise<string> {
  const sig = await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
    skipPreflight: true,
  });
  console.log(`  ${label}: ${sig.slice(0, 20)}...`);
  return sig;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("PERCOLATOR SOV V2 — FRESH MARKET SETUP");
  console.log("=".repeat(70));

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL not set in .env");

  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "./admin-keypair.json";
  const payer = loadKeypair(keypairPath);
  const connection = new Connection(rpcUrl, "confirmed");

  console.log(`\nAdmin: ${payer.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Matcher: ${MATCHER_PROGRAM_ID.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);

  // ========================================================================
  // Step 1: Create slab account
  // ========================================================================
  console.log("Step 1: Creating slab account...");
  const slab = Keypair.generate();
  const rentExempt = await connection.getMinimumBalanceForRentExemption(SLAB_SIZE);
  console.log(`  Slab: ${slab.publicKey.toBase58()}`);
  console.log(`  Rent: ${(rentExempt / 1e9).toFixed(4)} SOL`);

  if (balance < rentExempt + 100_000_000) {
    throw new Error(`Need ~${((rentExempt + 100_000_000) / 1e9).toFixed(2)} SOL, have ${(balance / 1e9).toFixed(4)}`);
  }

  const createSlabTx = new Transaction();
  addPriority(createSlabTx, 100_000);
  createSlabTx.add(SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: slab.publicKey,
    lamports: rentExempt,
    space: SLAB_SIZE,
    programId: PROGRAM_ID,
  }));
  await send(connection, createSlabTx, [payer, slab], "Slab created");

  // Save keypair immediately
  fs.writeFileSync("slab-keypair-v2.json", JSON.stringify(Array.from(slab.secretKey)));

  // ========================================================================
  // Step 2: Derive vault PDA + create vault ATA
  // ========================================================================
  console.log("\nStep 2: Setting up vault...");
  const [vaultPda] = deriveVaultAuthority(PROGRAM_ID, slab.publicKey);
  const vaultAccount = await getOrCreateAssociatedTokenAccount(connection, payer, PERC_MINT, vaultPda, true);
  const vault = vaultAccount.address;
  console.log(`  Vault PDA: ${vaultPda.toBase58()}`);
  console.log(`  Vault ATA: ${vault.toBase58()}`);

  // ========================================================================
  // Step 3: Initialize market (inverted, admin oracle, Hyperp mode)
  // ========================================================================
  console.log("\nStep 3: Initializing market...");
  const initMarketData = encodeInitMarket({
    admin: payer.publicKey,
    collateralMint: PERC_MINT,
    indexFeedId: "0".repeat(64),           // All zeros = Hyperp/admin oracle mode
    maxStalenessSecs: "86400",
    confFilterBps: 0,
    invert: 1,                              // INVERTED
    unitScale: 0,
    initialMarkPriceE6: "1000000",         // $1.00
    warmupPeriodSlots: "100",
    maintenanceMarginBps: "500",
    initialMarginBps: "1000",
    tradingFeeBps: "30",
    maxAccounts: "4096",
    newAccountFee: "1000000",
    riskReductionThreshold: "0",
    maintenanceFeePerSlot: "0",
    maxCrankStalenessSlots: "400",
    liquidationFeeBps: "100",
    liquidationFeeCap: "100000000000",
    liquidationBufferBps: "50",
    minLiquidationAbs: "1000000",
  });
  const initMarketKeys = buildAccountMetas(ACCOUNTS_INIT_MARKET, [
    payer.publicKey, slab.publicKey, PERC_MINT, vault,
    TOKEN_PROGRAM_ID, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY,
    vaultPda, SystemProgram.programId,
  ]);
  const initTx = new Transaction();
  addPriority(initTx, 200_000);
  initTx.add(buildIx({ programId: PROGRAM_ID, keys: initMarketKeys, data: initMarketData }));
  await send(connection, initTx, [payer], "Market initialized");

  // ========================================================================
  // Step 4: Set oracle authority
  // ========================================================================
  console.log("\nStep 4: Setting oracle authority...");
  const setAuthTx = new Transaction();
  addPriority(setAuthTx, 50_000);
  setAuthTx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [payer.publicKey, slab.publicKey]),
    data: encodeSetOracleAuthority({ newAuthority: payer.publicKey }),
  }));
  await send(connection, setAuthTx, [payer], "Oracle authority set");

  // ========================================================================
  // Step 5: Push initial oracle price
  // ========================================================================
  console.log("\nStep 5: Pushing initial oracle price...");
  const now = Math.floor(Date.now() / 1000);
  const pushTx = new Transaction();
  addPriority(pushTx, 50_000);
  pushTx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, slab.publicKey]),
    data: encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() }),
  }));
  await send(connection, pushTx, [payer], "Price pushed ($1.00)");

  // ========================================================================
  // Step 6: Update config (funding + threshold params)
  // ========================================================================
  console.log("\nStep 6: Setting funding parameters...");
  const updateCfgTx = new Transaction();
  addPriority(updateCfgTx, 50_000);
  updateCfgTx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_UPDATE_CONFIG, [payer.publicKey, slab.publicKey]),
    data: encodeUpdateConfig({
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
    }),
  }));
  await send(connection, updateCfgTx, [payer], "Funding params set");

  // ========================================================================
  // Step 7: Initial keeper crank (empty market)
  // ========================================================================
  console.log("\nStep 7: Initial keeper crank...");
  const crank1Tx = new Transaction();
  addPriority(crank1Tx, 400_000);
  crank1Tx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
      payer.publicKey, slab.publicKey, SYSVAR_CLOCK_PUBKEY, slab.publicKey,
    ]),
    data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
  }));
  await send(connection, crank1Tx, [payer], "Initial crank OK");

  // ========================================================================
  // Step 8: Create matcher context + LP
  // ========================================================================
  console.log("\nStep 8: Setting up LP with vAMM matcher...");

  // Create matcher context account
  const matcherCtxKp = Keypair.generate();
  const matcherRent = await connection.getMinimumBalanceForRentExemption(MATCHER_CTX_SIZE);
  const createMatcherTx = new Transaction();
  addPriority(createMatcherTx, 50_000);
  createMatcherTx.add(SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: matcherCtxKp.publicKey,
    lamports: matcherRent,
    space: MATCHER_CTX_SIZE,
    programId: MATCHER_PROGRAM_ID,
  }));
  await send(connection, createMatcherTx, [payer, matcherCtxKp], "Matcher context created");

  // Derive LP PDA
  const lpIndex = 0;
  const [lpPda] = deriveLpPda(PROGRAM_ID, slab.publicKey, lpIndex);

  // Initialize matcher with vAMM Tag 2 (66 bytes)
  const initVammData = Buffer.alloc(66);
  {
    let off = 0;
    initVammData.writeUInt8(2, off); off += 1;         // Tag 2 = InitVamm
    initVammData.writeUInt8(0, off); off += 1;         // mode 0 = passive
    initVammData.writeUInt32LE(50, off); off += 4;     // tradingFeeBps = 50
    initVammData.writeUInt32LE(50, off); off += 4;     // baseSpreadBps = 50
    initVammData.writeUInt32LE(200, off); off += 4;    // maxTotalBps = 200
    initVammData.writeUInt32LE(0, off); off += 4;      // impactKBps = 0
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
  addPriority(initMatcherTx, 50_000);
  initMatcherTx.add({
    programId: MATCHER_PROGRAM_ID,
    keys: [
      { pubkey: lpPda, isSigner: false, isWritable: false },
      { pubkey: matcherCtxKp.publicKey, isSigner: false, isWritable: true },
    ],
    data: initVammData,
  });
  await send(connection, initMatcherTx, [payer], "vAMM matcher initialized");

  // Initialize LP
  const initLpTx = new Transaction();
  addPriority(initLpTx, 100_000);
  initLpTx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_INIT_LP, [
      payer.publicKey, slab.publicKey,
      (await getOrCreateAssociatedTokenAccount(connection, payer, PERC_MINT, payer.publicKey)).address,
      vault, TOKEN_PROGRAM_ID,
    ]),
    data: encodeInitLP({
      matcherProgram: MATCHER_PROGRAM_ID,
      matcherContext: matcherCtxKp.publicKey,
      feePayment: "2000000",
    }),
  }));
  await send(connection, initLpTx, [payer], "LP initialized");

  // ========================================================================
  // Step 9: Deposit LP collateral (250M PERC)
  // ========================================================================
  console.log("\nStep 9: Depositing 250M PERC as LP collateral...");
  const adminAta = await getOrCreateAssociatedTokenAccount(connection, payer, PERC_MINT, payer.publicKey);
  console.log(`  Admin ATA: ${adminAta.address.toBase58()}`);
  console.log(`  Admin PERC balance: ${adminAta.amount.toString()}`);

  const depositTx = new Transaction();
  addPriority(depositTx, 100_000);
  depositTx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [
      payer.publicKey, slab.publicKey, adminAta.address,
      vault, TOKEN_PROGRAM_ID, SYSVAR_CLOCK_PUBKEY,
    ]),
    data: encodeDepositCollateral({ userIdx: lpIndex, amount: LP_COLLATERAL_AMOUNT.toString() }),
  }));
  await send(connection, depositTx, [payer], "250M PERC deposited to LP");

  // ========================================================================
  // Step 10: Top up insurance fund
  // ========================================================================
  console.log("\nStep 10: Topping up insurance fund...");
  const topupTx = new Transaction();
  addPriority(topupTx, 100_000);
  topupTx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_TOPUP_INSURANCE, [
      payer.publicKey, slab.publicKey, adminAta.address,
      vault, TOKEN_PROGRAM_ID,
    ]),
    data: encodeTopUpInsurance({ amount: INSURANCE_FUND_AMOUNT.toString() }),
  }));
  await send(connection, topupTx, [payer], "Insurance fund topped up (1000 PERC)");

  // ========================================================================
  // Step 11: CRITICAL — Second crank (after LP setup)
  // ========================================================================
  console.log("\nStep 11: Second keeper crank (verifying crank works with LP)...");

  // Push fresh price first
  const now2 = Math.floor(Date.now() / 1000);
  const pushTx2 = new Transaction();
  addPriority(pushTx2, 50_000);
  pushTx2.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, slab.publicKey]),
    data: encodePushOraclePrice({ priceE6: "1000000", timestamp: now2.toString() }),
  }));
  await send(connection, pushTx2, [payer], "Fresh price pushed");

  // Second crank
  const crank2Tx = new Transaction();
  addPriority(crank2Tx, 500_000);
  crank2Tx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
      payer.publicKey, slab.publicKey, SYSVAR_CLOCK_PUBKEY, slab.publicKey,
    ]),
    data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
  }));
  await send(connection, crank2Tx, [payer], "Second crank OK");

  // ========================================================================
  // Step 12: Third crank (triple-check)
  // ========================================================================
  console.log("\nStep 12: Third keeper crank (stability check)...");
  await new Promise(r => setTimeout(r, 2000)); // wait 2s for slot advancement
  const now3 = Math.floor(Date.now() / 1000);
  const crank3Tx = new Transaction();
  addPriority(crank3Tx, 500_000);
  crank3Tx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, slab.publicKey]),
    data: encodePushOraclePrice({ priceE6: "1000000", timestamp: now3.toString() }),
  }));
  crank3Tx.add(buildIx({
    programId: PROGRAM_ID,
    keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
      payer.publicKey, slab.publicKey, SYSVAR_CLOCK_PUBKEY, slab.publicKey,
    ]),
    data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
  }));
  await send(connection, crank3Tx, [payer], "Third crank OK");

  // ========================================================================
  // Verify + Save
  // ========================================================================
  console.log("\n" + "=".repeat(70));
  console.log("VERIFYING FINAL STATE");
  console.log("=".repeat(70));

  const finalInfo = await connection.getAccountInfo(slab.publicKey);
  if (finalInfo) {
    const header = parseHeader(finalInfo.data);
    const config = parseConfig(finalInfo.data);
    const engine = parseEngine(finalInfo.data);

    console.log(`  Version: ${header.version}`);
    console.log(`  Admin: ${header.admin.toBase58()}`);
    console.log(`  Inverted: ${config.invert === 1 ? "Yes" : "No"}`);
    console.log(`  Oracle Authority: ${config.oracleAuthority.toBase58()}`);
    console.log(`  Vault: ${engine.vault}`);
    console.log(`  Insurance fund: ${engine.insuranceFund.balance}`);
    console.log(`  LP capital (cTot): ${engine.cTot}`);
    console.log(`  numUsedAccounts: ${engine.numUsedAccounts}`);
    console.log(`  lastCrankSlot: ${engine.lastCrankSlot}`);

    // Check the suspicious field
    const base = 392;
    const field224 = finalInfo.data.readBigInt64LE(base + 224);
    console.log(`  engine[+224] (funding rate?): ${field224}`);
  }

  // Save market info
  const marketInfo = {
    network: "mainnet",
    version: 2,
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

  fs.writeFileSync("sov-market-v2.json", JSON.stringify(marketInfo, null, 2));
  console.log("\nMarket info saved to sov-market-v2.json");

  console.log("\n" + "=".repeat(70));
  console.log("SOV MARKET V2 SETUP COMPLETE");
  console.log("=".repeat(70));
  console.log(`  Slab: ${slab.publicKey.toBase58()}`);
  console.log(`  LP collateral: 250M PERC`);
  console.log(`  Insurance: 1000 PERC`);
  console.log(`  Three cranks verified OK`);
  console.log(`\n  Update .env: NEXT_PUBLIC_SLAB_ADDRESS=${slab.publicKey.toBase58()}`);
}

main().catch((err) => {
  console.error("\nFailed:", err.message || err);
  if (err.logs) console.error("Logs:", err.logs);
  process.exit(1);
});
