import { Connection, PublicKey } from "@solana/web3.js";
import { parseConfig, parseParams, parseEngine } from "../packages/core/src/solana/slab.js";
import * as dotenv from "dotenv";
dotenv.config();

const conn = new Connection(process.env.RPC_URL || "");
const slab = new PublicKey("AdqY3YniKDY5vFtiUzGpnm7SgjcqVoZD8QvHjinhhNYB");

async function check() {
  const info = await conn.getAccountInfo(slab);
  if (info === null) { console.log("Slab not found"); return; }
  const config = parseConfig(info.data);
  const params = parseParams(info.data);
  const engine = parseEngine(info.data);
  console.log("Config:");
  console.log("  invert:", config.invert);
  console.log("  oracleAuthority:", config.oracleAuthority.toBase58());
  console.log("  authorityPriceE6:", String(config.authorityPriceE6));
  console.log("  maxStalenessSecs:", String(config.maxStalenessSecs));
  console.log("  lastEffectivePriceE6:", String(config.lastEffectivePriceE6));
  console.log("Params:");
  console.log("  maxCrankStalenessSlots:", String(params.maxCrankStalenessSlots));
  console.log("  tradingFeeBps:", String(params.tradingFeeBps));
  console.log("Engine:");
  console.log("  lastCrankSlot:", String(engine.lastCrankSlot));
  console.log("  lastFullSweepStartSlot:", String(engine.lastFullSweepStartSlot));
  console.log("  insuranceFund:", JSON.stringify(engine.insuranceFund));

  // Get current slot
  const slot = await conn.getSlot();
  console.log("\nCurrent slot:", slot);
  console.log("Slots since last crank:", slot - Number(engine.lastCrankSlot));
}
check();
