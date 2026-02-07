import { Connection, PublicKey } from "@solana/web3.js";
import { parseAllAccounts } from "../packages/core/src/solana/slab.js";
import * as dotenv from "dotenv";
dotenv.config();

const conn = new Connection(process.env.RPC_URL || "");
const SLAB = new PublicKey("687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc");

async function main() {
  const info = await conn.getAccountInfo(SLAB);
  if (!info) { console.log("NOT FOUND"); return; }
  const data = new Uint8Array(info.data);
  const accounts = parseAllAccounts(data);
  for (const { idx, account } of accounts) {
    if (account.positionSize !== 0n || account.reservedPnl !== 0n) {
      console.log(
        `idx=${idx} pos=${account.positionSize} entry=${account.entryPrice} ` +
        `reservedPnl=${account.reservedPnl} pnl=${account.pnl} ` +
        `owner=${account.owner.toBase58().slice(0, 8)}...`
      );
    }
  }
}

main().catch(console.error);
