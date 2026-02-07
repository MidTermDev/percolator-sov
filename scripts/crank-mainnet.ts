/**
 * Mainnet keeper crank bot for SOV market
 *
 * Fetches real PERC price from DexScreener, pushes it on-chain, and cranks.
 * Falls back to last known price if the API is unreachable.
 *
 * Usage: npx tsx scripts/crank-mainnet.ts
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
import {
  encodeKeeperCrank,
  encodePushOraclePrice,
} from "../packages/core/src/abi/instructions.js";
import {
  buildAccountMetas,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_PUSH_ORACLE_PRICE,
} from "../packages/core/src/abi/accounts.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";

dotenv.config();

const marketInfo = JSON.parse(fs.readFileSync("sov-market.json", "utf-8"));
const PROGRAM_ID = new PublicKey(marketInfo.programId);
const SLAB = new PublicKey(marketInfo.slab);
const PERC_MINT = marketInfo.mint;

const CRANK_INTERVAL_MS = 5000;
const PRIORITY_FEE = 50_000;
const PRICE_FETCH_INTERVAL_MS = 10_000; // fetch new price every 10s (not every crank)

const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "./admin-keypair.json";
const raw = fs.readFileSync(keypairPath, "utf-8");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
const connection = new Connection(process.env.RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

let lastPriceE6 = 0;
let lastPriceFetchTime = 0;

async function fetchPercPrice(): Promise<number> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${PERC_MINT}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "percolator-crank/1.0" },
    signal: AbortSignal.timeout(5000),
  });
  const json = await resp.json() as any;
  const pairs = json.pairs || [];
  if (pairs.length === 0) {
    throw new Error("No PERC pairs found on DexScreener");
  }
  // Use the highest-liquidity pair
  const sorted = pairs.sort((a: any, b: any) =>
    (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
  );
  return parseFloat(sorted[0].priceUsd);
}

async function getPrice(): Promise<number> {
  const now = Date.now();
  if (now - lastPriceFetchTime < PRICE_FETCH_INTERVAL_MS && lastPriceE6 > 0) {
    return lastPriceE6;
  }
  try {
    const price = await fetchPercPrice();
    const priceE6 = Math.max(Math.round(price * 1_000_000), 1);
    lastPriceE6 = priceE6;
    lastPriceFetchTime = now;
    return priceE6;
  } catch (err: any) {
    if (lastPriceE6 > 0) {
      console.warn(`  Price fetch failed (using cached ${lastPriceE6}): ${err.message}`);
      return lastPriceE6;
    }
    throw err;
  }
}

async function pushAndCrank(): Promise<{ sig: string; priceE6: number }> {
  const now = Math.floor(Date.now() / 1000);
  const priceE6 = await getPrice();

  // Push oracle price
  const pushData = encodePushOraclePrice({ priceE6: priceE6.toString(), timestamp: now.toString() });
  const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]);

  // Keeper crank
  const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
  const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
    payer.publicKey,
    SLAB,
    SYSVAR_CLOCK_PUBKEY,
    SLAB, // admin oracle: oracle account = slab
  ]);

  // Combine into single tx: push price THEN crank
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));
  tx.add(buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));
  tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
    skipPreflight: true,
  });
  return { sig, priceE6 };
}

async function main() {
  console.log("SOV Mainnet Crank Bot (live price from DexScreener)\n");
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Slab: ${SLAB.toBase58()}`);
  console.log(`Token: ${PERC_MINT}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);

  // Fetch initial price before starting
  const initPrice = await fetchPercPrice();
  lastPriceE6 = Math.max(Math.round(initPrice * 1_000_000), 1);
  lastPriceFetchTime = Date.now();
  console.log(`Initial PERC price: $${initPrice} (price_e6: ${lastPriceE6})`);
  console.log(`Cranking every ${CRANK_INTERVAL_MS / 1000}s, price refresh every ${PRICE_FETCH_INTERVAL_MS / 1000}s\n`);

  let crankCount = 0;
  let errorCount = 0;

  while (true) {
    try {
      const { sig, priceE6 } = await pushAndCrank();
      crankCount++;
      const priceUsd = (priceE6 / 1_000_000).toFixed(6);
      console.log(`[${new Date().toISOString()}] #${crankCount} OK $${priceUsd} ${sig.slice(0, 16)}...`);
    } catch (err: any) {
      errorCount++;
      const msg = err.logs ? err.logs.join("\n  ") : err.message?.slice(0, 200) || String(err);
      console.error(`[${new Date().toISOString()}] Error (${errorCount}):\n  ${msg}`);
    }

    await new Promise((r) => setTimeout(r, CRANK_INTERVAL_MS));
  }
}

main().catch(console.error);
