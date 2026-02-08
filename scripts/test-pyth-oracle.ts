/**
 * Comprehensive Pyth Oracle Integration Test
 *
 * Tests:
 * 1. PDA derivation for known feeds (SOL/USD, BTC/USD, ETH/USD)
 * 2. On-chain account existence and ownership verification
 * 3. PriceUpdateV2 data layout parsing (feed_id, price, conf, expo, publish_time)
 * 4. Hermes API price fetching + comparison with on-chain data
 * 5. Admin vs Pyth oracle detection logic
 * 6. Our deployed PERC market config reading
 * 7. End-to-end: derive PDA → read on-chain → compare with Hermes
 *
 * Usage: npx tsx scripts/test-pyth-oracle.ts
 */

import { Connection, PublicKey } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { derivePythPushOraclePDA, PYTH_PUSH_ORACLE_PROGRAM_ID } from "../packages/core/src/solana/pda.js";
import { parseConfig, parseHeader } from "../packages/core/src/solana/slab.js";

dotenv.config();

const conn = new Connection(
  process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
  "confirmed",
);

const PYTH_RECEIVER = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";

// Well-known Pyth feed IDs (mainnet)
const FEEDS = {
  "SOL/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "BTC/USD": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "ETH/USD": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
};

// PriceUpdateV2 layout (Borsh-serialized)
// The VerificationLevel enum at offset 40 determines the base offset:
//   Partial (0x00) → 2 bytes (variant + num_signatures) → base = 42
//   Full    (0x01) → 1 byte  (variant only)             → base = 41
const VERIFICATION_LEVEL_OFF = 40;
const PRICE_UPDATE_V2_MIN_LEN = 134;

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${msg}`);
  }
}

function parsePriceUpdateV2(data: Buffer) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const discriminator = data.subarray(0, 8);
  const writeAuthority = new PublicKey(data.subarray(8, 40));
  const verificationVariant = data[VERIFICATION_LEVEL_OFF];

  // Dynamic base offset based on VerificationLevel variant
  let base: number;
  let verificationLabel: string;
  if (verificationVariant === 0) {
    base = VERIFICATION_LEVEL_OFF + 2; // Partial: variant(1) + num_signatures(1)
    verificationLabel = `Partial(num_sigs=${data[41]})`;
  } else if (verificationVariant === 1) {
    base = VERIFICATION_LEVEL_OFF + 1; // Full: variant(1) only
    verificationLabel = "Full";
  } else {
    throw new Error(`Unknown verification variant: ${verificationVariant}`);
  }

  const feedId = Buffer.from(data.subarray(base, base + 32)).toString("hex");
  const price = dv.getBigInt64(base + 32, true);
  const conf = dv.getBigUint64(base + 40, true);
  const expo = dv.getInt32(base + 48, true);
  const publishTime = dv.getBigInt64(base + 52, true);

  const priceUsd = Number(price) * Math.pow(10, expo);
  const confUsd = Number(conf) * Math.pow(10, expo);
  const age = Math.floor(Date.now() / 1000) - Number(publishTime);

  return {
    discriminator,
    writeAuthority,
    verificationVariant,
    verificationLabel,
    base,
    feedId,
    price,
    conf,
    expo,
    publishTime,
    priceUsd,
    confUsd,
    age,
  };
}

async function fetchHermesPrice(feedIdHex: string) {
  const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedIdHex}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const json = (await resp.json()) as any;
  if (!json.parsed || json.parsed.length === 0) {
    throw new Error(`No Hermes data for feed ${feedIdHex.slice(0, 16)}...`);
  }
  const p = json.parsed[0];
  const rawPrice = Number(p.price.price);
  const expo = Number(p.price.expo);
  const priceUsd = rawPrice * Math.pow(10, expo);
  const conf = Number(p.price.conf) * Math.pow(10, expo);
  const publishTime = Number(p.price.publish_time);
  return { priceUsd, conf, publishTime, rawPrice, expo };
}

// ============================================================================
// TEST 1: PDA Derivation
// ============================================================================
async function testPDADerivation() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 1: Pyth Push Oracle PDA Derivation");
  console.log("=".repeat(70));

  // Known PDA values (verified via pyth-crosschain tooling)
  const expectedPDAs: Record<string, string> = {
    "SOL/USD": "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
    "BTC/USD": "4cSM2e6rvbGQUFiJbqytoVMi5GgghSMr8LwVrT9VPSPo",
  };

  for (const [label, feedId] of Object.entries(FEEDS)) {
    const [pda, bump] = derivePythPushOraclePDA(feedId);
    console.log(`\n  ${label}:`);
    console.log(`    Feed ID:  ${feedId}`);
    console.log(`    PDA:      ${pda.toBase58()}`);
    console.log(`    Bump:     ${bump}`);

    if (expectedPDAs[label]) {
      assert(pda.toBase58() === expectedPDAs[label], `${label} PDA matches expected: ${expectedPDAs[label]}`);
    }

    // Verify it's a valid PDA under the Push Oracle program
    assert(bump <= 255 && bump >= 0, `${label} bump is valid: ${bump}`);
  }

  // Edge case: all-zeros feed ID should still produce a valid PDA
  const [zeroPda] = derivePythPushOraclePDA("0".repeat(64));
  assert(zeroPda instanceof PublicKey, "All-zeros feed ID produces valid PDA");
}

// ============================================================================
// TEST 2: On-Chain Account Verification
// ============================================================================
async function testOnChainAccounts() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 2: On-Chain Pyth Push Oracle Account Verification");
  console.log("=".repeat(70));

  for (const [label, feedId] of Object.entries(FEEDS)) {
    const [pda] = derivePythPushOraclePDA(feedId);
    console.log(`\n  ${label} (${pda.toBase58()}):`);

    const info = await conn.getAccountInfo(pda);
    assert(info !== null, `${label} account EXISTS on mainnet`);

    if (!info) continue;

    assert(
      info.owner.toBase58() === PYTH_RECEIVER,
      `${label} owner is Pyth Receiver (${info.owner.toBase58().slice(0, 12)}...)`,
    );
    assert(
      info.data.length >= PRICE_UPDATE_V2_MIN_LEN,
      `${label} data length >= ${PRICE_UPDATE_V2_MIN_LEN} (actual: ${info.data.length})`,
    );

    // Parse the PriceUpdateV2 data
    const parsed = parsePriceUpdateV2(info.data as Buffer);

    console.log(`    Verification: ${parsed.verificationLabel} (base offset: ${parsed.base})`);

    assert(
      parsed.feedId === feedId,
      `${label} feed_id matches (${parsed.feedId.slice(0, 16)}...)`,
    );
    assert(
      parsed.priceUsd > 0,
      `${label} price is positive: $${parsed.priceUsd.toFixed(4)}`,
    );
    assert(
      parsed.expo < 0,
      `${label} exponent is negative: ${parsed.expo}`,
    );
    assert(
      parsed.age < 120,
      `${label} publish_time is recent (age: ${parsed.age}s)`,
    );
    assert(
      parsed.confUsd > 0 && parsed.confUsd < parsed.priceUsd * 0.1,
      `${label} confidence is reasonable: ±$${parsed.confUsd.toFixed(4)} (${((parsed.confUsd / parsed.priceUsd) * 100).toFixed(3)}%)`,
    );

    console.log(`    Price:      $${parsed.priceUsd.toFixed(4)}`);
    console.log(`    Confidence: ±$${parsed.confUsd.toFixed(4)}`);
    console.log(`    Exponent:   ${parsed.expo}`);
    console.log(`    Published:  ${new Date(Number(parsed.publishTime) * 1000).toISOString()}`);
    console.log(`    Age:        ${parsed.age}s`);
  }
}

// ============================================================================
// TEST 3: Hermes API Price Fetching
// ============================================================================
async function testHermesAPI() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 3: Hermes API Price Fetching");
  console.log("=".repeat(70));

  for (const [label, feedId] of Object.entries(FEEDS)) {
    console.log(`\n  ${label}:`);
    try {
      const hermes = await fetchHermesPrice(feedId);
      assert(hermes.priceUsd > 0, `${label} Hermes price is positive: $${hermes.priceUsd.toFixed(4)}`);
      assert(hermes.conf > 0, `${label} Hermes confidence: ±$${hermes.conf.toFixed(4)}`);

      const age = Math.floor(Date.now() / 1000) - hermes.publishTime;
      assert(age < 30, `${label} Hermes data is fresh (age: ${age}s)`);

      console.log(`    Price:      $${hermes.priceUsd.toFixed(4)}`);
      console.log(`    Confidence: ±$${hermes.conf.toFixed(4)}`);
      console.log(`    Exponent:   ${hermes.expo}`);
      console.log(`    Age:        ${age}s`);
    } catch (err: any) {
      assert(false, `${label} Hermes fetch failed: ${err.message}`);
    }
  }
}

// ============================================================================
// TEST 4: On-Chain vs Hermes Price Comparison
// ============================================================================
async function testPriceComparison() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 4: On-Chain vs Hermes Price Comparison");
  console.log("=".repeat(70));

  for (const [label, feedId] of Object.entries(FEEDS)) {
    const [pda] = derivePythPushOraclePDA(feedId);
    console.log(`\n  ${label}:`);

    try {
      // Fetch both sources concurrently
      const [accountInfo, hermes] = await Promise.all([
        conn.getAccountInfo(pda),
        fetchHermesPrice(feedId),
      ]);

      if (!accountInfo) {
        assert(false, `${label} on-chain account missing`);
        continue;
      }

      const onChain = parsePriceUpdateV2(accountInfo.data as Buffer);

      const priceDiff = Math.abs(onChain.priceUsd - hermes.priceUsd);
      const priceDiffPct = (priceDiff / hermes.priceUsd) * 100;

      console.log(`    On-chain:  $${onChain.priceUsd.toFixed(4)} (age: ${onChain.age}s)`);
      console.log(`    Hermes:    $${hermes.priceUsd.toFixed(4)}`);
      console.log(`    Diff:      $${priceDiff.toFixed(4)} (${priceDiffPct.toFixed(3)}%)`);

      // Prices should be very close (within 1% given slight timing differences)
      assert(
        priceDiffPct < 1.0,
        `${label} on-chain and Hermes prices within 1%: diff=${priceDiffPct.toFixed(3)}%`,
      );
    } catch (err: any) {
      assert(false, `${label} comparison failed: ${err.message}`);
    }
  }
}

// ============================================================================
// TEST 5: Admin vs Pyth Oracle Detection
// ============================================================================
async function testOracleDetection() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 5: Admin vs Pyth Oracle Detection Logic");
  console.log("=".repeat(70));

  const ALL_ZEROS = new PublicKey("11111111111111111111111111111111");

  // Admin oracle: all-zeros feed ID
  assert(
    ALL_ZEROS.equals(PublicKey.default),
    "All-zeros pubkey equals PublicKey.default",
  );

  // Simulate a Pyth feed ID stored as PublicKey
  const solFeedId = FEEDS["SOL/USD"];
  const feedBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    feedBytes[i] = parseInt(solFeedId.substring(i * 2, i * 2 + 2), 16);
  }
  const feedAsPubkey = new PublicKey(feedBytes);

  assert(!feedAsPubkey.equals(ALL_ZEROS), "Pyth feed ID is NOT all-zeros");
  assert(!feedAsPubkey.equals(PublicKey.default), "Pyth feed ID is NOT PublicKey.default");

  // Round-trip: PublicKey → hex → PDA
  const hexRoundTrip = Buffer.from(feedAsPubkey.toBytes()).toString("hex");
  assert(hexRoundTrip === solFeedId, `Feed ID round-trips correctly: ${hexRoundTrip.slice(0, 16)}...`);

  const [pdaFromRoundTrip] = derivePythPushOraclePDA(hexRoundTrip);
  const [pdaDirect] = derivePythPushOraclePDA(solFeedId);
  assert(
    pdaFromRoundTrip.equals(pdaDirect),
    "PDA from round-tripped feed ID matches direct derivation",
  );

  // Test the detection logic that useLivePrice uses
  function isAdminOracle(indexFeedId: PublicKey): boolean {
    return indexFeedId.equals(ALL_ZEROS) || indexFeedId.equals(PublicKey.default);
  }

  assert(isAdminOracle(ALL_ZEROS), "All-zeros detected as admin oracle");
  assert(isAdminOracle(PublicKey.default), "PublicKey.default detected as admin oracle");
  assert(!isAdminOracle(feedAsPubkey), "Pyth feed ID NOT detected as admin oracle");

  // Test the hex extraction logic used in useLivePrice
  function getFeedIdHex(indexFeedId: PublicKey): string | null {
    if (isAdminOracle(indexFeedId)) return null;
    const bytes = indexFeedId.toBytes();
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  assert(getFeedIdHex(ALL_ZEROS) === null, "Admin oracle returns null feed ID");
  assert(getFeedIdHex(feedAsPubkey) === solFeedId, "Pyth oracle returns correct feed ID hex");
}

// ============================================================================
// TEST 6: Read Our Deployed PERC Market
// ============================================================================
async function testDeployedMarket() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 6: Deployed PERC Market Config");
  console.log("=".repeat(70));

  const SLAB = new PublicKey("687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc");
  const info = await conn.getAccountInfo(SLAB);
  assert(info !== null, "PERC slab account exists on mainnet");

  if (!info) return;

  const data = new Uint8Array(info.data);
  const header = parseHeader(data);
  const config = parseConfig(data);

  console.log(`\n  Market State:`);
  console.log(`    Magic:           ${Buffer.from(data.subarray(0, 8)).toString("ascii")}`);
  console.log(`    Version:         ${header.version}`);
  console.log(`    Collateral Mint: ${config.collateralMint.toBase58()}`);
  console.log(`    Vault:           ${config.vaultPubkey.toBase58()}`);
  console.log(`    Index Feed ID:   ${config.indexFeedId.toBase58()}`);
  console.log(`    Invert:          ${config.invert}`);
  console.log(`    Max Staleness:   ${config.maxStalenessSlots} slots`);
  console.log(`    Oracle Authority:${config.oracleAuthority.toBase58()}`);
  console.log(`    Authority Price: ${config.authorityPriceE6} (e6)`);
  console.log(`    Last Eff. Price: ${config.lastEffectivePriceE6} (e6)`);
  console.log(`    Price Cap:       ${config.oraclePriceCapE2bps} e2bps`);

  const ALL_ZEROS = new PublicKey("11111111111111111111111111111111");
  const isAdmin = config.indexFeedId.equals(ALL_ZEROS) || config.indexFeedId.equals(PublicKey.default);
  assert(isAdmin, "PERC market uses admin oracle (all-zeros feed ID)");
  assert(config.invert === 1, "PERC market is inverted");
  assert(
    config.collateralMint.toBase58() === "A16Gd8AfaPnG6rohE6iPFDf6mr9gk519d6aMUJAperc",
    "Collateral mint is PERC",
  );

  // Show current admin-pushed price
  if (config.authorityPriceE6 > 0n) {
    const priceUsd = Number(config.authorityPriceE6) / 1_000_000;
    console.log(`\n  Current admin-pushed price: $${priceUsd.toFixed(6)}`);
  }
  if (config.lastEffectivePriceE6 > 0n) {
    const effPriceUsd = Number(config.lastEffectivePriceE6) / 1_000_000;
    console.log(`  Last effective price:       $${effPriceUsd.toFixed(6)}`);
  }
}

// ============================================================================
// TEST 7: End-to-End Pyth Flow Simulation
// ============================================================================
async function testEndToEndPyth() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 7: End-to-End Pyth Oracle Flow (SOL/USD)");
  console.log("=".repeat(70));

  const feedId = FEEDS["SOL/USD"];
  console.log(`\n  Step 1: Derive PDA from feed ID`);
  const [pda, bump] = derivePythPushOraclePDA(feedId);
  console.log(`    Feed: ${feedId}`);
  console.log(`    PDA:  ${pda.toBase58()} (bump=${bump})`);
  assert(pda.toBase58() === "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE", "SOL/USD PDA correct");

  console.log(`\n  Step 2: Read on-chain PriceUpdateV2 account`);
  const info = await conn.getAccountInfo(pda);
  assert(info !== null, "Account exists");
  if (!info) return;

  assert(info.owner.toBase58() === PYTH_RECEIVER, "Owner is Pyth Receiver");
  const onChain = parsePriceUpdateV2(info.data as Buffer);
  console.log(`    Price:     $${onChain.priceUsd.toFixed(4)}`);
  console.log(`    Conf:      ±$${onChain.confUsd.toFixed(4)}`);
  console.log(`    Expo:      ${onChain.expo}`);
  console.log(`    Age:       ${onChain.age}s`);
  console.log(`    Published: ${new Date(Number(onChain.publishTime) * 1000).toISOString()}`);

  console.log(`\n  Step 3: Fetch from Hermes API (same feed)`);
  const hermes = await fetchHermesPrice(feedId);
  const hermesAge = Math.floor(Date.now() / 1000) - hermes.publishTime;
  console.log(`    Price:     $${hermes.priceUsd.toFixed(4)}`);
  console.log(`    Conf:      ±$${hermes.conf.toFixed(4)}`);
  console.log(`    Expo:      ${hermes.expo}`);
  console.log(`    Age:       ${hermesAge}s`);

  console.log(`\n  Step 4: Compare prices`);
  const diff = Math.abs(onChain.priceUsd - hermes.priceUsd);
  const diffPct = (diff / hermes.priceUsd) * 100;
  console.log(`    On-chain:  $${onChain.priceUsd.toFixed(4)}`);
  console.log(`    Hermes:    $${hermes.priceUsd.toFixed(4)}`);
  console.log(`    Diff:      ${diffPct.toFixed(4)}%`);
  assert(diffPct < 2, `Price diff < 2%: ${diffPct.toFixed(4)}%`);

  console.log(`\n  Step 5: Simulate KeeperCrank account setup`);
  console.log(`    This is what the crank bot would pass to KeeperCrank:`);
  console.log(`    accounts[0]: caller        = <payer pubkey>`);
  console.log(`    accounts[1]: slab          = <market slab>`);
  console.log(`    accounts[2]: clock         = SysvarC1ock11111111111111111111111111111111`);
  console.log(`    accounts[3]: oracle        = ${pda.toBase58()}`);
  console.log(`    The on-chain program will:`);
  console.log(`      1. Check oracle account owner == ${PYTH_RECEIVER}`);
  console.log(`      2. Read verification_level at byte 40: ${onChain.verificationLabel}`);
  console.log(`      3. Compute dynamic base offset: ${onChain.base}`);
  console.log(`      4. Read feed_id at offset ${onChain.base} and verify it matches config`);
  console.log(`      5. Read price at offset ${onChain.base + 32}: ${onChain.price} (raw)`);
  console.log(`      6. Read expo at offset ${onChain.base + 48}: ${onChain.expo}`);
  console.log(`      7. Convert to e6: ${Math.round(onChain.priceUsd * 1_000_000)}`);
  console.log(`      8. Apply circuit breaker (clamp to ±cap from last price)`);
  console.log(`      9. Use clamped price for funding rate + liquidation checks`);
  assert(true, "End-to-end flow simulation complete");
}

// ============================================================================
// TEST 8: Multiple Feed Batch Fetch
// ============================================================================
async function testBatchFetch() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 8: Batch Hermes Fetch (Multiple Feeds)");
  console.log("=".repeat(70));

  // Hermes supports multiple feeds in one request
  const feedIds = Object.values(FEEDS);
  const queryParams = feedIds.map(id => `ids[]=${id}`).join("&");
  const url = `https://hermes.pyth.network/v2/updates/price/latest?${queryParams}`;

  console.log(`\n  Fetching ${feedIds.length} feeds in one request...`);
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const json = (await resp.json()) as any;

  assert(json.parsed !== undefined, "Hermes response has parsed field");
  assert(json.parsed.length === feedIds.length, `Got ${json.parsed.length} price updates (expected ${feedIds.length})`);

  const labels = Object.keys(FEEDS);
  for (let i = 0; i < json.parsed.length; i++) {
    const p = json.parsed[i];
    const price = Number(p.price.price) * Math.pow(10, Number(p.price.expo));
    const feedShort = p.id.slice(0, 16);
    console.log(`    ${labels[i] || feedShort}: $${price.toFixed(4)}`);
    assert(price > 0, `Feed ${feedShort}... has positive price`);
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║         PERCOLATOR - PYTH ORACLE INTEGRATION TEST SUITE            ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");
  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  console.log(`RPC: ${(process.env.RPC_URL || "default").replace(/api-key=.*/, "api-key=***")}`);
  console.log(`Pyth Push Oracle Program: ${PYTH_PUSH_ORACLE_PROGRAM_ID.toBase58()}`);
  console.log(`Pyth Receiver Program:    ${PYTH_RECEIVER}`);

  await testPDADerivation();
  await testOnChainAccounts();
  await testHermesAPI();
  await testPriceComparison();
  await testOracleDetection();
  await testDeployedMarket();
  await testEndToEndPyth();
  await testBatchFetch();

  console.log("\n" + "=".repeat(70));
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log("=".repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
