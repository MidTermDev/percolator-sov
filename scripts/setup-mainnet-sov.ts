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

  // Step 1: Create slab account
  console.log("Step 1: Creating slab account...");
  const slab = Keypair.generate();
  console.log(`  Slab: ${slab.publicKey.toBase58()}`);

  const rentExempt = await connection.getMinimumBalanceForRentExemption(SLAB_SIZE);
  console.log(`  Rent: ${(rentExempt / 1e9).toFixed(4)} SOL`);

  const createSlabTx = new Transaction();
  addPriorityFee(createSlabTx);
  createSlabTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
  createSlabTx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: slab.publicKey,
      lamports: rentExempt,
      space: SLAB_SIZE,
      programId: PROGRAM_ID,
    })
  );
  await sendAndConfirmTransaction(connection, createSlabTx, [payer, slab], { commitment: "confirmed" });
  console.log("  Slab created");

  // Step 2: Derive vault PDA + create vault ATA
  console.log("\nStep 2: Setting up vault...");
  const [vaultPda] = deriveVaultAuthority(PROGRAM_ID, slab.publicKey);
  console.log(`  Vault PDA: ${vaultPda.toBase58()}`);

  const vaultAccount = await getOrCreateAssociatedTokenAccount(
    connection, payer, PERC_MINT, vaultPda, true
  );
  const vault = vaultAccount.address;
  console.log(`  Vault ATA: ${vault.toBase58()}`);

  // Step 3: Initialize market (inverted, admin oracle)
  console.log("\nStep 3: Initializing INVERTED market with admin oracle...");
  const allZeroFeedId = "0".repeat(64); // Admin oracle mode

  const initMarketData = encodeInitMarket({
    admin: payer.publicKey,
    collateralMint: PERC_MINT,
    indexFeedId: allZeroFeedId,
    maxStalenessSecs: "86400",           // 24h (admin oracle doesn't use staleness)
    confFilterBps: 0,                     // No confidence filter for admin oracle
    invert: 1,                            // INVERTED market
    unitScale: 0,
    initialMarkPriceE6: "1000000",       // $1.00 initial price
    warmupPeriodSlots: "100",
    maintenanceMarginBps: "500",          // 5% maintenance margin
    initialMarginBps: "1000",             // 10% initial margin
    tradingFeeBps: "30",                  // 0.3% trading fee
    maxAccounts: "4096",
    newAccountFee: "1000000",             // 1 PERC account creation fee
    riskReductionThreshold: "0",
    maintenanceFeePerSlot: "0",
    maxCrankStalenessSlots: "400",
    liquidationFeeBps: "100",             // 1% liquidation fee
    liquidationFeeCap: "100000000000",    // 100k PERC cap
    liquidationBufferBps: "50",           // 0.5% buffer
    minLiquidationAbs: "1000000",         // 1 PERC minimum
  });

  const initMarketKeys = buildAccountMetas(ACCOUNTS_INIT_MARKET, [
    payer.publicKey,
    slab.publicKey,
    PERC_MINT,
    vault,
    TOKEN_PROGRAM_ID,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    vaultPda,
    SystemProgram.programId,
  ]);

  const initTx = new Transaction();
  addPriorityFee(initTx);
  initTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  initTx.add(buildIx({ programId: PROGRAM_ID, keys: initMarketKeys, data: initMarketData }));
  await sendAndConfirmTransaction(connection, initTx, [payer], { commitment: "confirmed" });
  console.log("  Market initialized (inverted=true, adminOracle=true)");

  // Step 4: Set oracle authority to admin
  console.log("\nStep 4: Setting oracle authority...");
  const setAuthData = encodeSetOracleAuthority({ newAuthority: payer.publicKey });
  const setAuthKeys = buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [
    payer.publicKey,
    slab.publicKey,
  ]);

  const setAuthTx = new Transaction();
  addPriorityFee(setAuthTx);
  setAuthTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }));
  setAuthTx.add(buildIx({ programId: PROGRAM_ID, keys: setAuthKeys, data: setAuthData }));
  await sendAndConfirmTransaction(connection, setAuthTx, [payer], { commitment: "confirmed" });
  console.log(`  Oracle authority set to ${payer.publicKey.toBase58()}`);

  // Step 5: Push initial price
  console.log("\nStep 5: Pushing initial oracle price...");
  const now = Math.floor(Date.now() / 1000);
  const pushPriceData = encodePushOraclePrice({ priceE6: "1000000", timestamp: now.toString() });
  const pushPriceKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [
    payer.publicKey,
    slab.publicKey,
  ]);

  const pushTx = new Transaction();
  addPriorityFee(pushTx);
  pushTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }));
  pushTx.add(buildIx({ programId: PROGRAM_ID, keys: pushPriceKeys, data: pushPriceData }));
  await sendAndConfirmTransaction(connection, pushTx, [payer], { commitment: "confirmed" });
  console.log("  Price set to $1.00");

  // Step 6: Run initial keeper crank
  console.log("\nStep 6: Running initial keeper crank...");
  const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
  const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
    payer.publicKey,
    slab.publicKey,
    SYSVAR_CLOCK_PUBKEY,
    slab.publicKey, // oracle account (admin oracle uses slab itself)
  ]);

  const crankTx = new Transaction();
  addPriorityFee(crankTx);
  crankTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  crankTx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));
  await sendAndConfirmTransaction(connection, crankTx, [payer], {
    commitment: "confirmed",
    skipPreflight: true,
  });
  console.log("  Keeper crank executed");

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

  // Initialize matcher context
  const initMatcherTx = new Transaction();
  addPriorityFee(initMatcherTx);
  initMatcherTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }));
  initMatcherTx.add({
    programId: MATCHER_PROGRAM_ID,
    keys: [
      { pubkey: lpPda, isSigner: false, isWritable: false },
      { pubkey: matcherCtxKp.publicKey, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([1]),
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
