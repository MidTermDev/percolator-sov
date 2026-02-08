/**
 * Admin force-close ALL open positions using the new AdminForceClose instruction.
 * Does NOT require user signatures — admin only.
 * After closing all positions, updates margin params to 2x max leverage (5000 bps initial).
 */
import { Connection, PublicKey, Keypair, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import {
  parseAllAccounts,
  parseConfig,
  encodeAdminForceClose,
  encodeUpdateRiskParams,
  ACCOUNTS_ADMIN_FORCE_CLOSE,
  ACCOUNTS_UPDATE_RISK_PARAMS,
  buildAccountMetas,
  buildIx,
  simulateOrSend,
} from "../packages/core/src/index.js";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";

dotenv.config();

const conn = new Connection(process.env.RPC_URL || "");
const SLAB = new PublicKey("687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc");
const PROGRAM_ID = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");

const admin = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync("admin-keypair.json", "utf-8")))
);

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  if (!info) { console.log("Slab not found"); return; }

  const data = new Uint8Array(info.data);
  const config = parseConfig(data);
  const accounts = parseAllAccounts(data);

  console.log(`Admin: ${admin.publicKey.toBase58()}`);
  console.log(`Slab:  ${SLAB.toBase58()}`);

  // Find all accounts with open positions (users AND LPs)
  const openPositions = accounts.filter(a => a.account.positionSize !== 0n);

  if (openPositions.length === 0) {
    console.log("\nNo open positions found.");
  } else {
    console.log(`\n=== ${openPositions.length} open position(s) to force-close ===`);
    for (const { idx, account } of openPositions) {
      const absPos = account.positionSize < 0n ? -account.positionSize : account.positionSize;
      const dir = account.positionSize > 0n ? "LONG" : "SHORT";
      const kind = account.kind === 1 ? "LP" : "User";
      console.log(
        `  idx=${idx} [${kind}] owner=${account.owner.toBase58()} ${dir} ${(Number(absPos) / 1e6).toLocaleString()} ` +
        `capital=${(Number(account.capital) / 1e6).toLocaleString()}`
      );
    }

    console.log("\nForce-closing all positions...\n");

    for (const { idx, account } of openPositions) {
      const absPos = account.positionSize < 0n ? -account.positionSize : account.positionSize;
      const dir = account.positionSize > 0n ? "LONG" : "SHORT";

      console.log(`Closing idx=${idx} (${dir} ${(Number(absPos) / 1e6).toLocaleString()})...`);

      const ixData = encodeAdminForceClose({ targetIdx: idx });

      // AdminForceClose accounts: [admin(signer), slab(writable), clock, oracle]
      // For Hyperp/admin-oracle mode, oracle account is unused — pass SLAB as dummy
      const keys = buildAccountMetas(ACCOUNTS_ADMIN_FORCE_CLOSE, [
        admin.publicKey,
        SLAB,
        SYSVAR_CLOCK_PUBKEY,
        SLAB,  // oracle (unused in Hyperp mode)
      ]);

      const ix = buildIx({ programId: PROGRAM_ID, keys, data: ixData });

      const result = await simulateOrSend({
        connection: conn,
        ix,
        signers: [admin],
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
  }

  // Update margin params to 2x max leverage
  console.log("\n=== Updating margin params to 2x max leverage ===");
  console.log("  initial_margin_bps: 5000 (50% = 2x)");
  console.log("  maintenance_margin_bps: 2500 (25%)");

  const updateIxData = encodeUpdateRiskParams({
    initialMarginBps: 5000n,
    maintenanceMarginBps: 2500n,
  });

  const updateKeys = buildAccountMetas(ACCOUNTS_UPDATE_RISK_PARAMS, [
    admin.publicKey,
    SLAB,
  ]);

  const updateIx = buildIx({ programId: PROGRAM_ID, keys: updateKeys, data: updateIxData });

  const updateResult = await simulateOrSend({
    connection: conn,
    ix: updateIx,
    signers: [admin],
    simulate: false,
    commitment: "confirmed",
    computeUnitLimit: 200_000,
  });

  if (updateResult.err) {
    console.log(`  ERROR: ${updateResult.err}`);
    if (updateResult.hint) console.log(`  Hint: ${updateResult.hint}`);
  } else {
    console.log(`  OK: ${updateResult.signature}`);
  }

  console.log("\nDone. All positions closed, leverage set to 2x max.");
}

main().catch(console.error);
