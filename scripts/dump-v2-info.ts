/**
 * Dump V2 slab market info for sov-market.json
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import * as dotenv from "dotenv";
dotenv.config();

import { deriveVaultAuthority, deriveLpPda } from "../packages/core/src/solana/pda.js";
import { parseHeader, parseConfig, parseEngine } from "../packages/core/src/solana/slab.js";

const PROGRAM_ID = new PublicKey("GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24");
const PERC_MINT = new PublicKey("A16Gd8AfaPnG6rohE6iPFDf6mr9gk519d6aMUJAperc");
const SLAB = new PublicKey("687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc");

async function main() {
  const connection = new Connection(process.env.RPC_URL || "", "confirmed");

  const [vaultPda] = deriveVaultAuthority(PROGRAM_ID, SLAB);
  const vault = await getAssociatedTokenAddress(PERC_MINT, vaultPda, true);
  const [lpPda] = deriveLpPda(PROGRAM_ID, SLAB, 0);

  console.log("Vault PDA:", vaultPda.toBase58());
  console.log("Vault ATA:", vault.toBase58());
  console.log("LP PDA:", lpPda.toBase58());

  const info = await connection.getAccountInfo(SLAB);
  if (info) {
    const header = parseHeader(info.data);
    const config = parseConfig(info.data);
    const engine = parseEngine(info.data);
    console.log("\nHeader:");
    console.log("  admin:", header.admin.toBase58());
    console.log("\nConfig:");
    console.log("  oracleAuthority:", config.oracleAuthority.toBase58());
    console.log("  invert:", config.invert);
    console.log("\nEngine:");
    console.log("  vault:", engine.vault.toString());
    console.log("  insurance:", engine.insuranceFund?.balance?.toString());
    console.log("  cTot:", engine.cTot.toString());
    console.log("  numUsedAccounts:", engine.numUsedAccounts);
    console.log("  lastCrankSlot:", engine.lastCrankSlot.toString());

    // Read matcher context from engine account 0 (LP)
    // Account 0 starts at accounts offset. Let's read the LP's matcher_context
    const ENGINE_OFF = 392;
    const ACCOUNTS_OFF = ENGINE_OFF + 9136 - 392; // need to find exact offset
    // Actually just parse from known offsets
  }

  // Get admin ATA
  const adminAta = await getAssociatedTokenAddress(PERC_MINT, new PublicKey("CTNRpc2N1Jhgjk4GfmoQuzHKC5HcxiSTE5Bh471yU6FP"));
  console.log("\nAdmin ATA:", adminAta.toBase58());
}

main().catch(console.error);
