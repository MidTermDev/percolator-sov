"use client";

import { FC } from "react";
import {
  computeEstimatedEntryPrice,
  computeTradingFee,
  computePreTradeLiqPrice,
} from "@/lib/trading";
import { formatUsd, formatTokenAmount } from "@/lib/format";

interface PreTradeSummaryProps {
  oracleE6: bigint;
  margin: bigint;
  positionSize: bigint;
  direction: "long" | "short";
  leverage: number;
  tradingFeeBps: bigint;
  maintenanceMarginBps: bigint;
  symbol: string;
}

export const PreTradeSummary: FC<PreTradeSummaryProps> = ({
  oracleE6,
  margin,
  positionSize,
  direction,
  leverage,
  tradingFeeBps,
  maintenanceMarginBps,
  symbol,
}) => {
  if (oracleE6 === 0n || margin === 0n || positionSize === 0n) return null;

  const estEntry = computeEstimatedEntryPrice(oracleE6, tradingFeeBps, direction);
  const fee = computeTradingFee(positionSize, tradingFeeBps);
  const liqPrice = computePreTradeLiqPrice(
    oracleE6,
    margin,
    positionSize,
    maintenanceMarginBps,
    tradingFeeBps,
    direction,
  );

  return (
    <div className="mb-4 space-y-1.5 rounded-lg bg-[#1a1a28] p-3 text-xs text-[#71717a]">
      <div className="flex justify-between">
        <span>Est. Entry Price</span>
        <span className="font-medium text-[#e4e4e7]">{formatUsd(estEntry)}</span>
      </div>
      <div className="flex justify-between">
        <span>Notional Value</span>
        <span className="font-medium text-[#e4e4e7]">
          {formatTokenAmount(positionSize)} {symbol}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Trading Fee</span>
        <span className="font-medium text-[#e4e4e7]">
          {formatTokenAmount(fee)} {symbol}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Est. Liq Price</span>
        <span className={`font-medium ${direction === "long" ? "text-red-400" : "text-emerald-400"}`}>
          {formatUsd(liqPrice)}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Margin Required</span>
        <span className="font-medium text-[#e4e4e7]">
          {formatTokenAmount(margin)} {symbol}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Direction</span>
        <span className={`font-medium ${direction === "long" ? "text-emerald-400" : "text-red-400"}`}>
          {direction === "long" ? "Long" : "Short"} {leverage}x
        </span>
      </div>
    </div>
  );
};
