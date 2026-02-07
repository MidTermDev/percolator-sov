import { Connection, PublicKey } from "@solana/web3.js";
import { parseAllAccounts, AccountKind } from "../packages/core/src/solana/slab.js";
import * as dotenv from "dotenv";
dotenv.config();

const conn = new Connection(process.env.RPC_URL || "");
const SLAB = new PublicKey("687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc");

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  if (!info) { console.log("NOT FOUND"); return; }
  const data = new Uint8Array(info.data);
  const accounts = parseAllAccounts(data);

  console.log(`Total accounts: ${accounts.length}\n`);
  for (const { idx, account } of accounts) {
    const kind = account.kind === AccountKind.LP ? "LP" : "User";
    const pos = account.positionSize;
    const absPos = pos < 0n ? -pos : pos;
    const dir = pos === 0n ? "FLAT" : pos > 0n ? "LONG" : "SHORT";
    console.log(
      `idx=${idx} ${kind.padEnd(4)} owner=${account.owner.toBase58()} ` +
      `${dir.padEnd(5)} pos=${(Number(absPos) / 1e6).toLocaleString().padStart(15)} ` +
      `cap=${(Number(account.capital) / 1e6).toLocaleString().padStart(15)}`
    );
  }
}

main().catch(console.error);
