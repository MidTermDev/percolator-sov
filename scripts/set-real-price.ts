/**
 * Transition oracle from $1.00 to real PERC price from Jupiter.
 *
 * 1. Disable price cap (set to 0)
 * 2. Fetch real PERC price from Jupiter Price API
 * 3. Push real price
 * 4. Crank
 * 5. Re-enable price cap (5% per push = 50_000 e2bps)
 */
import {
  Connection, Keypair, PublicKey, Transaction,
  ComputeBudgetProgram, SYSVAR_CLOCK_PUBKEY, sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

import {
  encodeSetOraclePriceCap, encodePushOraclePrice, encodeKeeperCrank,
} from "../packages/core/src/abi/instructions.js";
import {
  buildAccountMetas,
  ACCOUNTS_SET_ORACLE_AUTHORITY, ACCOUNTS_PUSH_ORACLE_PRICE, ACCOUNTS_KEEPER_CRANK,
} from "../packages/core/src/abi/accounts.js";
import { buildIx } from "../packages/core/src/runtime/tx.js";

const PROGRAM_ID = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
const SLAB = new PublicKey("687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc");
const PERC_MINT = "A16Gd8AfaPnG6rohE6iPFDf6mr9gk519d6aMUJAperc";
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./admin-keypair.json", "utf-8"))));
const connection = new Connection(process.env.RPC_URL || "", "confirmed");

async function fetchPercPrice(): Promise<number> {
  // DexScreener API (no auth required)
  const url = `https://api.dexscreener.com/latest/dex/tokens/${PERC_MINT}`;
  const resp = await fetch(url, { headers: { "User-Agent": "percolator-crank/1.0" } });
  const json = await resp.json() as any;
  const pairs = json.pairs || [];
  if (pairs.length === 0) {
    throw new Error("No PERC pairs found on DexScreener");
  }
  // Use the highest-liquidity pair
  const sorted = pairs.sort((a: any, b: any) =>
    (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
  );
  const price = parseFloat(sorted[0].priceUsd);
  console.log(`  Source: ${sorted[0].dexId} (${sorted[0].pairAddress.slice(0, 8)}...)`);
  console.log(`  Liquidity: $${sorted[0].liquidity?.usd?.toFixed(2)}`);
  return price;
}

async function main() {
  console.log("=== Transition Oracle to Real Price ===\n");

  // Fetch real price
  const realPrice = await fetchPercPrice();
  console.log(`PERC real price: $${realPrice}`);
  const priceE6 = Math.round(realPrice * 1_000_000);
  console.log(`price_e6: ${priceE6}`);

  if (priceE6 < 1) {
    console.log("Price too small (< $0.000001), using minimum of 1");
  }
  const finalPriceE6 = Math.max(priceE6, 1);
  console.log(`final price_e6: ${finalPriceE6}`);

  // Step 1: Disable price cap
  console.log("\nStep 1: Disabling oracle price cap...");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
    // SetOraclePriceCap uses same 2-account layout as SetOracleAuthority
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [payer.publicKey, SLAB]),
      data: encodeSetOraclePriceCap({ maxChangeE2bps: "0" }), // 0 = disabled
    }));
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    console.log(`  Cap disabled: ${sig.slice(0, 20)}...`);
  }

  // Step 2: Push real price
  console.log("\nStep 2: Pushing real price...");
  const now = Math.floor(Date.now() / 1000);
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, SLAB]),
      data: encodePushOraclePrice({ priceE6: finalPriceE6.toString(), timestamp: now.toString() }),
    }));
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    console.log(`  Price pushed ($${realPrice}): ${sig.slice(0, 20)}...`);
  }

  // Step 3: Crank
  console.log("\nStep 3: Cranking...");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }));
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [payer.publicKey, SLAB, SYSVAR_CLOCK_PUBKEY, SLAB]),
      data: encodeKeeperCrank({ callerIdx: 65535, allowPanic: false }),
    }));
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    console.log(`  Crank OK: ${sig.slice(0, 20)}...`);
  }

  // Step 4: Re-enable price cap (5% per push)
  console.log("\nStep 4: Re-enabling price cap (5% per push)...");
  {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
    tx.add(buildIx({
      programId: PROGRAM_ID,
      keys: buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [payer.publicKey, SLAB]),
      data: encodeSetOraclePriceCap({ maxChangeE2bps: "50000" }), // 50000 e2bps = 5%
    }));
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    console.log(`  Cap re-enabled (5%): ${sig.slice(0, 20)}...`);
  }

  console.log("\nDone! Oracle now set to real PERC price.");
  console.log(`  Price: $${realPrice} (price_e6: ${finalPriceE6})`);
}

main().catch(console.error);
