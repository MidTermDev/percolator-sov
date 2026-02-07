import { Connection, PublicKey } from "@solana/web3.js";
import { parseConfig, parseParams, parseEngine } from "../src/solana/slab.js";
import * as dotenv from "dotenv";
dotenv.config();

const conn = new Connection(process.env.RPC_URL || "");
const slab = new PublicKey("AdqY3YniKDY5vFtiUzGpnm7SgjcqVoZD8QvHjinhhNYB");

async function dump() {
  const info = await conn.getAccountInfo(slab);
  if (!info) { console.log("Slab not found"); return; }

  const config = parseConfig(info.data);
  const params = parseParams(info.data);
  const engine = parseEngine(info.data);
  const slot = await conn.getSlot();

  console.log("=== CONFIG ===");
  console.log("  invert:", config.invert);
  console.log("  oracleAuthority:", config.oracleAuthority.toBase58());
  console.log("  authorityPriceE6:", String(config.authorityPriceE6));
  console.log("  authorityTimestamp:", String(config.authorityTimestamp));
  console.log("  oraclePriceCapE2bps:", String(config.oraclePriceCapE2bps));
  console.log("  lastEffectivePriceE6:", String(config.lastEffectivePriceE6));
  console.log("  fundingHorizonSlots:", String(config.fundingHorizonSlots));
  console.log("  fundingKBps:", String(config.fundingKBps));
  console.log("  fundingInvScaleNotionalE6:", String(config.fundingInvScaleNotionalE6));
  console.log("  fundingMaxPremiumBps:", String(config.fundingMaxPremiumBps));
  console.log("  fundingMaxBpsPerSlot:", String(config.fundingMaxBpsPerSlot));
  console.log("  unitScale:", config.unitScale);
  console.log("  indexFeedId:", config.indexFeedId.toBase58());

  console.log("\n=== PARAMS ===");
  console.log("  warmupPeriodSlots:", String(params.warmupPeriodSlots));
  console.log("  maintenanceMarginBps:", String(params.maintenanceMarginBps));
  console.log("  initialMarginBps:", String(params.initialMarginBps));
  console.log("  tradingFeeBps:", String(params.tradingFeeBps));
  console.log("  maxAccounts:", String(params.maxAccounts));
  console.log("  newAccountFee:", String(params.newAccountFee));
  console.log("  riskReductionThreshold:", String(params.riskReductionThreshold));
  console.log("  maintenanceFeePerSlot:", String(params.maintenanceFeePerSlot));
  console.log("  maxCrankStalenessSlots:", String(params.maxCrankStalenessSlots));
  console.log("  liquidationFeeBps:", String(params.liquidationFeeBps));
  console.log("  liquidationFeeCap:", String(params.liquidationFeeCap));
  console.log("  liquidationBufferBps:", String(params.liquidationBufferBps));
  console.log("  minLiquidationAbs:", String(params.minLiquidationAbs));

  console.log("\n=== ENGINE STATE ===");
  console.log("  vault:", String(engine.vault));
  console.log("  insuranceFund.balance:", String(engine.insuranceFund.balance));
  console.log("  insuranceFund.feeRevenue:", String(engine.insuranceFund.feeRevenue));
  console.log("  currentSlot:", String(engine.currentSlot));
  console.log("  fundingIndexQpbE6:", String(engine.fundingIndexQpbE6));
  console.log("  lastFundingSlot:", String(engine.lastFundingSlot));
  console.log("  fundingRateBpsPerSlotLast:", String(engine.fundingRateBpsPerSlotLast));
  console.log("  lastCrankSlot:", String(engine.lastCrankSlot));
  console.log("  maxCrankStalenessSlots:", String(engine.maxCrankStalenessSlots));
  console.log("  totalOpenInterest:", String(engine.totalOpenInterest));
  console.log("  cTot:", String(engine.cTot));
  console.log("  pnlPosTot:", String(engine.pnlPosTot));
  console.log("  liqCursor:", engine.liqCursor);
  console.log("  gcCursor:", engine.gcCursor);
  console.log("  lastSweepStartSlot:", String(engine.lastSweepStartSlot));
  console.log("  lastSweepCompleteSlot:", String(engine.lastSweepCompleteSlot));
  console.log("  crankCursor:", engine.crankCursor);
  console.log("  sweepStartIdx:", engine.sweepStartIdx);
  console.log("  lifetimeLiquidations:", String(engine.lifetimeLiquidations));
  console.log("  lifetimeForceCloses:", String(engine.lifetimeForceCloses));
  console.log("  netLpPos:", String(engine.netLpPos));
  console.log("  lpSumAbs:", String(engine.lpSumAbs));
  console.log("  lpMaxAbs:", String(engine.lpMaxAbs));
  console.log("  lpMaxAbsSweep:", String(engine.lpMaxAbsSweep));
  console.log("  numUsedAccounts:", engine.numUsedAccounts);
  console.log("  nextAccountId:", String(engine.nextAccountId));

  console.log("\n=== DIAGNOSTICS ===");
  console.log("  Current slot (live):", slot);
  console.log("  Slots since lastCrankSlot:", slot - Number(engine.lastCrankSlot));
  console.log("  Slots since lastFundingSlot:", slot - Number(engine.lastFundingSlot));
  console.log("  Slots since lastSweepStartSlot:", slot - Number(engine.lastSweepStartSlot));
  console.log("  lastFundingSlot is zero?", engine.lastFundingSlot === 0n);
  console.log("  currentSlot (engine) is zero?", engine.currentSlot === 0n);

  // Raw bytes around engine for debugging
  const base = 392;
  console.log("\n=== RAW ENGINE BYTES (first 256) ===");
  const raw = info.data.subarray(base, base + 256);
  for (let i = 0; i < raw.length; i += 32) {
    const hex = Buffer.from(raw.subarray(i, i + 32)).toString("hex");
    console.log(`  [${i.toString().padStart(3)}] ${hex}`);
  }
}
dump();
