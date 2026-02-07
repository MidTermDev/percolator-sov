"use client";

import { FC } from "react";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useMarketConfig } from "@/hooks/useMarketConfig";
import { formatTokenAmount, formatUsd } from "@/lib/format";

export const PositionPanel: FC = () => {
  const userAccount = useUserAccount();
  const config = useMarketConfig();

  if (!userAccount) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
          Position
        </h3>
        <p className="text-sm text-gray-500">No active position</p>
      </div>
    );
  }

  const { account } = userAccount;
  const hasPosition = account.positionSize !== 0n;
  const isLong = account.positionSize > 0n;
  const absPosition = account.positionSize < 0n
    ? -account.positionSize
    : account.positionSize;

  const pnlPositive = account.pnl > 0n;
  const pnlColor = account.pnl === 0n
    ? "text-gray-400"
    : pnlPositive
      ? "text-emerald-400"
      : "text-red-400";

  // Estimate liquidation price (simplified)
  // liq price = entry * (1 - margin) for longs, entry * (1 + margin) for shorts
  let liqPriceStr = "N/A";
  if (hasPosition && config) {
    const oraclePrice = Number(config.lastEffectivePriceE6) / 1e6;
    const capital = Number(account.capital) / 1e6;
    const posSize = Number(absPosition) / 1e6;
    if (posSize > 0) {
      const marginRatio = capital / (posSize * oraclePrice);
      liqPriceStr = `~${(marginRatio * 100).toFixed(1)}% margin`;
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        Position
      </h3>

      {!hasPosition ? (
        <p className="text-sm text-gray-500">No open position</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Direction</span>
            <span
              className={`text-sm font-medium ${
                isLong ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {isLong ? "LONG" : "SHORT"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Size</span>
            <span className="text-sm text-white">
              {formatTokenAmount(absPosition)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Entry Price</span>
            <span className="text-sm text-white">
              {formatUsd(account.entryPrice)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Unrealized PnL</span>
            <span className={`text-sm font-medium ${pnlColor}`}>
              {account.pnl > 0n ? "+" : ""}
              {formatTokenAmount(
                account.pnl < 0n ? -account.pnl : account.pnl
              )}
              {account.pnl < 0n ? " (loss)" : ""}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Margin Health</span>
            <span className="text-sm text-gray-400">{liqPriceStr}</span>
          </div>
        </div>
      )}
    </div>
  );
};
