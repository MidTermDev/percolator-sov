/**
 * Force-close all open user positions using trade-nocpi (LP signs directly).
 * The admin/LP keypair flattens each position by trading the opposite size.
 */
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  parseAllAccounts,
  parseConfig,
  AccountKind,
  encodeTradeNoCpi,
  ACCOUNTS_TRADE_NOCPI,
  buildAccountMetas,
  buildIx,
  simulateOrSend,
  WELL_KNOWN,
} from "../packages/core/src/solana/slab.js";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";

dotenv.config();

const conn = new Connection(process.env.RPC_URL || "");
const SLAB = new PublicKey("687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc");
const PROGRAM_ID = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");

// Load the admin/LP keypair (same key that owns the LP account)
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync("admin-keypair.json", "utf-8")))
);

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  if (!info) { console.log("Slab not found"); return; }

  const data = new Uint8Array(info.data);
  const config = parseConfig(data);
  const accounts = parseAllAccounts(data);

  // Find LP account (we need its index)
  const lp = accounts.find(a => a.account.kind === AccountKind.LP);
  if (!lp) { console.log("No LP account found"); return; }
  console.log(`LP account: idx=${lp.idx}, owner=${lp.account.owner.toBase58()}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  // Find all user accounts with open positions
  const openPositions = accounts.filter(
    a => a.account.kind === AccountKind.User && a.account.positionSize !== 0n
  );

  if (openPositions.length === 0) {
    console.log("\nNo open positions found.");
    return;
  }

  console.log(`\n=== ${openPositions.length} open position(s) ===`);
  for (const { idx, account } of openPositions) {
    const absPos = account.positionSize < 0n ? -account.positionSize : account.positionSize;
    const dir = account.positionSize > 0n ? "LONG" : "SHORT";
    console.log(
      `  idx=${idx} owner=${account.owner.toBase58()} ${dir} ${(Number(absPos) / 1e6).toLocaleString()} PERC ` +
      `capital=${(Number(account.capital) / 1e6).toLocaleString()} PERC`
    );
  }

  // Confirm
  console.log("\nForce-closing all positions...\n");

  for (const { idx, account } of openPositions) {
    // To close: trade opposite direction with same size
    // If user is long (positive), we send negative size to flatten
    const closeSize = -account.positionSize;
    const dir = account.positionSize > 0n ? "LONG" : "SHORT";
    const absPos = account.positionSize < 0n ? -account.positionSize : account.positionSize;

    console.log(`Closing idx=${idx} (${dir} ${(Number(absPos) / 1e6).toLocaleString()} PERC)...`);

    const ixData = encodeTradeNoCpi({
      lpIdx: lp.idx,
      userIdx: idx,
      size: closeSize.toString(),
    });

    const keys = buildAccountMetas(ACCOUNTS_TRADE_NOCPI, [
      account.owner,      // user (but for nocpi, user doesn't need to sign if LP signs?)
      payer.publicKey,     // lp (signer)
      SLAB,               // slab
      WELL_KNOWN.clock,   // clock
      SLAB,               // oracle (admin oracle = slab)
    ]);

    const ix = buildIx({ programId: PROGRAM_ID, keys, data: ixData });

    const result = await simulateOrSend({
      connection: conn,
      ix,
      signers: [payer],
      simulate: false,
      commitment: "confirmed",
      computeUnitLimit: 400_000,
    });

    if (result.err) {
      console.log(`  ERROR: ${result.err}`);
      if (result.hint) console.log(`  Hint: ${result.hint}`);
    } else {
      console.log(`  OK: ${result.signature}`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
