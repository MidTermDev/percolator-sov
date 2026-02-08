/**
 * Shared trade math utilities.
 *
 * This is a coin-margined perpetual. The on-chain PnL formula is:
 *   mark_pnl = (oracle - entry) * abs_pos / oracle   (for longs)
 *   mark_pnl = (entry - oracle) * abs_pos / oracle   (for shorts)
 *
 * Key on-chain semantics:
 * - `entry_price` is the LAST SETTLED oracle price (reset every crank), NOT the trade entry.
 * - `reserved_pnl` stores the ACTUAL trade entry price (set when opening from flat).
 * - `pnl` accumulates settled mark-to-market PnL (negative = losing).
 * - `capital` is reduced by settled losses over time.
 *
 * For UI display of "unrealized PnL since trade entry", compute:
 *   mark_pnl(positionSize, tradeEntryPrice, currentOracle)
 *
 * For liquidation price, use current capital + entry_price (the settled reference),
 * since capital already reflects settled losses.
 */

/**
 * Compute coin-margined mark PnL (matching on-chain mark_pnl_for_position).
 * Returns PnL in collateral token units (divides by oracle, not 1e6).
 */
export function computeMarkPnl(
  positionSize: bigint,
  entryPrice: bigint,
  oraclePrice: bigint,
): bigint {
  if (positionSize === 0n || oraclePrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const diff = positionSize > 0n
    ? oraclePrice - entryPrice   // Long: profit when oracle > entry
    : entryPrice - oraclePrice;  // Short: profit when entry > oracle
  return (diff * absPos) / oraclePrice;
}

/**
 * Compute liquidation price for a position.
 *
 * Uses the settled reference (entry_price / current capital), NOT the trade entry,
 * because capital has already been adjusted by settled mark PnL.
 *
 * For longs: liqPrice = entryPrice - capitalPerUnit * adjustFactor
 * For shorts: liqPrice = entryPrice + capitalPerUnit * adjustFactor
 */
export function computeLiqPrice(
  entryPrice: bigint,
  capital: bigint,
  positionSize: bigint,
  maintenanceMarginBps: bigint,
): bigint {
  if (positionSize === 0n || entryPrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const maintBps = Number(maintenanceMarginBps);
  const capitalPerUnit = (Number(capital) * 1e6) / Number(absPos);
  const adjusted = (capitalPerUnit * 10000) / (10000 + maintBps);

  if (positionSize > 0n) {
    const liq = Number(entryPrice) - adjusted;
    return liq > 0 ? BigInt(Math.round(liq)) : 0n;
  } else {
    return BigInt(Math.round(Number(entryPrice) + adjusted));
  }
}

/**
 * Compute pre-trade estimated liquidation price (before a position is opened).
 * Takes into account trading fee reducing effective capital.
 */
export function computePreTradeLiqPrice(
  oracleE6: bigint,
  margin: bigint,
  posSize: bigint,
  maintBps: bigint,
  feeBps: bigint,
  direction: "long" | "short",
): bigint {
  if (oracleE6 === 0n || margin === 0n || posSize === 0n) return 0n;
  const absPos = posSize < 0n ? -posSize : posSize;
  const fee = (absPos * feeBps) / 10000n;
  const effectiveCapital = margin > fee ? margin - fee : 0n;
  const signedPos = direction === "long" ? absPos : -absPos;
  return computeLiqPrice(oracleE6, effectiveCapital, signedPos, maintBps);
}

/**
 * Compute trading fee for a given notional and fee rate.
 */
export function computeTradingFee(notional: bigint, tradingFeeBps: bigint): bigint {
  return (notional * tradingFeeBps) / 10000n;
}

/**
 * Compute PnL as a percentage of capital.
 * pnlTokens is the total unrealized PnL (from computeMarkPnl with trade entry).
 * Returns a number like 12.34 for +12.34%.
 */
export function computePnlPercent(
  pnlTokens: bigint,
  capital: bigint,
): number {
  if (capital === 0n) return 0;
  return (Number(pnlTokens) / Number(capital)) * 100;
}

/**
 * Compute annualized funding rate from per-slot bps.
 * ~2.5 slots/sec on Solana mainnet.
 */
export function computeFundingRateAnnualized(fundingRateBpsPerSlot: bigint): number {
  const bpsPerSlot = Number(fundingRateBpsPerSlot);
  const slotsPerYear = 2.5 * 60 * 60 * 24 * 365;
  return (bpsPerSlot * slotsPerYear) / 100; // convert bps to %
}

/**
 * Compute estimated entry price accounting for trading fee spread.
 * Longs pay above oracle, shorts pay below.
 */
export function computeEstimatedEntryPrice(
  oracleE6: bigint,
  tradingFeeBps: bigint,
  direction: "long" | "short",
): bigint {
  if (oracleE6 === 0n) return 0n;
  const feeImpact = (oracleE6 * tradingFeeBps) / 10000n;
  return direction === "long" ? oracleE6 + feeImpact : oracleE6 - feeImpact;
}
