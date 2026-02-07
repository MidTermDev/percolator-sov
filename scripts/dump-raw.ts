/**
 * Dump raw slab bytes for deep debugging
 */
import { Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
dotenv.config();

const conn = new Connection(process.env.RPC_URL || "");
const slab = new PublicKey("AdqY3YniKDY5vFtiUzGpnm7SgjcqVoZD8QvHjinhhNYB");

async function dump() {
  const info = await conn.getAccountInfo(slab);
  if (!info) { console.log("Slab not found"); return; }
  const d = info.data;
  console.log("Slab size:", d.length, "bytes");
  console.log("Program owner:", info.owner.toBase58());

  // Header (72 bytes)
  console.log("\n=== HEADER (offset 0-71) ===");
  console.log("  magic:", d.subarray(0, 8).toString("hex"), "=", d.subarray(0, 8).toString("ascii"));
  console.log("  version:", d.readUInt32LE(8));
  console.log("  bump:", d.readUInt8(12));
  console.log("  admin:", new PublicKey(d.subarray(16, 48)).toBase58());

  // Config starts at 72
  console.log("\n=== CONFIG (offset 72-391) ===");
  let off = 72;
  console.log("  [72] collateralMint:", new PublicKey(d.subarray(off, off+32)).toBase58()); off+=32;
  console.log("  [104] vaultPubkey:", new PublicKey(d.subarray(off, off+32)).toBase58()); off+=32;
  console.log("  [136] indexFeedId:", Buffer.from(d.subarray(off, off+32)).toString("hex")); off+=32;
  console.log("  [168] maxStalenessSlots:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [176] confFilterBps:", d.readUInt16LE(off)); off+=2;
  console.log("  [178] vaultAuthorityBump:", d.readUInt8(off)); off+=1;
  console.log("  [179] invert:", d.readUInt8(off)); off+=1;
  console.log("  [180] unitScale:", d.readUInt32LE(off)); off+=4;

  console.log("  [184] fundingHorizonSlots:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [192] fundingKBps:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [200] fundingInvScaleNotionalE6 (i128):", readI128(d, off).toString()); off+=16;
  console.log("  [216] fundingMaxPremiumBps:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [224] fundingMaxBpsPerSlot:", d.readBigUInt64LE(off).toString()); off+=8;

  // Threshold
  console.log("  [232] threshFloor (u128):", readU128(d, off).toString()); off+=16;
  console.log("  [248] threshRiskBps:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [256] threshUpdateIntervalSlots:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [264] threshStepBps:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [272] threshAlphaBps:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [280] threshMin (u128):", readU128(d, off).toString()); off+=16;
  console.log("  [296] threshMax (u128):", readU128(d, off).toString()); off+=16;
  console.log("  [312] threshMinStep (u128):", readU128(d, off).toString()); off+=16;

  // Oracle authority
  console.log("  [328] oracleAuthority:", new PublicKey(d.subarray(off, off+32)).toBase58()); off+=32;
  console.log("  [360] authorityPriceE6:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [368] authorityTimestamp:", d.readBigInt64LE(off).toString()); off+=8;
  console.log("  [376] oraclePriceCapE2bps:", d.readBigUInt64LE(off).toString()); off+=8;
  console.log("  [384] lastEffectivePriceE6:", d.readBigUInt64LE(off).toString()); off+=8;

  console.log("\n  Config ends at offset:", off, "(expected ENGINE_OFF=392)");

  // Engine starts at 392
  console.log("\n=== ENGINE (offset 392+) ===");
  const base = 392;
  console.log("  [+0] vault (u128):", readU128(d, base).toString());
  console.log("  [+16] insurance.balance (u128):", readU128(d, base+16).toString());
  console.log("  [+32] insurance.feeRevenue (u128):", readU128(d, base+32).toString());

  // RiskParams at engine+48 (144 bytes)
  console.log("\n  --- RiskParams (engine+48, 144 bytes) ---");
  const pBase = base + 48;
  console.log("  [+48] warmupPeriodSlots:", d.readBigUInt64LE(pBase).toString());
  console.log("  [+56] maintenanceMarginBps:", d.readBigUInt64LE(pBase+8).toString());
  console.log("  [+64] initialMarginBps:", d.readBigUInt64LE(pBase+16).toString());
  console.log("  [+72] tradingFeeBps:", d.readBigUInt64LE(pBase+24).toString());
  console.log("  [+80] maxAccounts:", d.readBigUInt64LE(pBase+32).toString());
  console.log("  [+88] newAccountFee (u128):", readU128(d, pBase+40).toString());
  console.log("  [+104] riskReductionThreshold (u128):", readU128(d, pBase+56).toString());
  console.log("  [+120] maintenanceFeePerSlot (u128):", readU128(d, pBase+72).toString());
  console.log("  [+136] maxCrankStalenessSlots:", d.readBigUInt64LE(pBase+88).toString());
  console.log("  [+144] liquidationFeeBps:", d.readBigUInt64LE(pBase+96).toString());
  console.log("  [+152] liquidationFeeCap (u128):", readU128(d, pBase+104).toString());
  console.log("  [+168] liquidationBufferBps:", d.readBigUInt64LE(pBase+120).toString());
  console.log("  [+176] minLiquidationAbs (u128):", readU128(d, pBase+128).toString());

  // After params (at engine+192)
  console.log("\n  --- Engine state (engine+192) ---");
  console.log("  [+192] currentSlot:", d.readBigUInt64LE(base+192).toString());
  console.log("  [+200] fundingIndexQpbE6 (i128):", readI128(d, base+200).toString());
  console.log("  [+216] lastFundingSlot:", d.readBigUInt64LE(base+216).toString());
  console.log("  [+224] field_224 (i64):", d.readBigInt64LE(base+224).toString(), "hex:", Buffer.from(d.subarray(base+224, base+232)).toString("hex"));
  console.log("  [+232] lastCrankSlot:", d.readBigUInt64LE(base+232).toString());
  console.log("  [+240] field_240:", d.readBigUInt64LE(base+240).toString());

  // Read the LP account at index 0
  // Accounts start at engine + 9136 = slab offset 392 + 9136 = 9528
  // But let's also try engine + 9128 = 9520
  const accBase1 = base + 9136;
  const accBase2 = base + 9128;
  console.log("\n  --- LP Account (idx 0 at ENGINE_ACCOUNTS_OFF=9136) ---");
  console.log("  Account start at slab offset:", accBase1);
  if (d.length > accBase1 + 240) {
    console.log("  account_id:", d.readBigUInt64LE(accBase1).toString());
    console.log("  capital (u128):", readU128(d, accBase1+8).toString());
    console.log("  kind:", d.readUInt8(accBase1+24));
    console.log("  pnl (i128):", readI128(d, accBase1+32).toString());
  }

  console.log("\n  --- LP Account (idx 0 at ENGINE_ACCOUNTS_OFF=9128, -8 alternate) ---");
  console.log("  Account start at slab offset:", accBase2);
  if (d.length > accBase2 + 240) {
    console.log("  account_id:", d.readBigUInt64LE(accBase2).toString());
    console.log("  capital (u128):", readU128(d, accBase2+8).toString());
    console.log("  kind:", d.readUInt8(accBase2+24));
    console.log("  pnl (i128):", readI128(d, accBase2+32).toString());
  }
}

function readU128(buf: Buffer, off: number): bigint {
  const lo = buf.readBigUInt64LE(off);
  const hi = buf.readBigUInt64LE(off + 8);
  return lo + (hi << 64n);
}

function readI128(buf: Buffer, off: number): bigint {
  const lo = buf.readBigUInt64LE(off);
  const hi = buf.readBigInt64LE(off + 8);
  return lo + (hi << 64n);
}

dump().catch(console.error);
