import { Connection, PublicKey } from "@solana/web3.js";
import { parseConfig, parseEngine, parseParams } from "../packages/core/src/solana/slab.js";
import * as dotenv from "dotenv";
dotenv.config();

const conn = new Connection(process.env.RPC_URL || "");
const slab = new PublicKey("687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc");

async function main() {
  const info = await conn.getAccountInfo(slab);
  if (!info) { console.log("NOT FOUND"); return; }
  const config = parseConfig(info.data);
  const params = parseParams(info.data);
  const engine = parseEngine(info.data);

  console.log("=== Config ===");
  console.log("  oraclePriceCapE2Bps:", config.oraclePriceCapE2Bps);
  console.log("  lastEffectivePriceE6:", config.lastEffectivePriceE6?.toString());
  console.log("  authorityPriceE6:", config.authorityPriceE6?.toString());
  console.log("  invert:", config.invert);
  console.log("  warmupPeriodSlots:", config.warmupPeriodSlots?.toString());
  console.log("  fundingHorizonSlots:", config.fundingHorizonSlots?.toString());
  console.log("  fundingKBps:", config.fundingKBps?.toString());
  console.log("  fundingMaxPremiumBps:", config.fundingMaxPremiumBps?.toString());
  console.log("  fundingMaxBpsPerSlot:", config.fundingMaxBpsPerSlot?.toString());

  console.log("\n=== Risk Params ===");
  console.log("  initialMarginBps:", params.initialMarginBps.toString());
  console.log("  maintenanceMarginBps:", params.maintenanceMarginBps.toString());
  console.log("  tradingFeeBps:", params.tradingFeeBps.toString());
  console.log("  maxAccounts:", params.maxAccounts.toString());
  console.log("  newAccountFee:", params.newAccountFee.toString());
  console.log("  liquidationFeeBps:", params.liquidationFeeBps.toString());
  console.log("  liquidationFeeCap:", params.liquidationFeeCap.toString());
  console.log("  liquidationBufferBps:", params.liquidationBufferBps.toString());
  console.log("  maintenanceFeePerSlot:", params.maintenanceFeePerSlot.toString());
  console.log("  warmupPeriodSlots:", params.warmupPeriodSlots.toString());
  console.log("  maxCrankStalenessSlots:", params.maxCrankStalenessSlots.toString());

  console.log("\n=== Engine ===");
  console.log("  vault:", engine.vault.toString(), `(${(Number(engine.vault) / 1e6).toFixed(2)} PERC)`);
  console.log("  cTot:", engine.cTot.toString(), `(${(Number(engine.cTot) / 1e6).toFixed(2)} PERC)`);
  console.log("  numUsedAccounts:", engine.numUsedAccounts);
  console.log("  totalOpenInterest:", engine.totalOpenInterest?.toString());
  console.log("  insuranceFund:", engine.insuranceFund?.balance?.toString(),
    `(${(Number(engine.insuranceFund?.balance || 0) / 1e6).toFixed(2)} PERC)`);
}

main().catch(console.error);
