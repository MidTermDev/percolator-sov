"use client";

import { FC, useMemo, useState } from "react";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useMarketConfig } from "@/hooks/useMarketConfig";
import { useTrade } from "@/hooks/useTrade";
import { useSlabState } from "@/components/providers/SlabProvider";
import { AccountKind } from "@percolator/core";
import { formatTokenAmount, formatUsd } from "@/lib/format";

export const PositionPanel: FC = () => {
  const userAccount = useUserAccount();
  const config = useMarketConfig();
  const { trade, loading: closeLoading, error: closeError } = useTrade();
  const { accounts } = useSlabState();
  const [closeSig, setCloseSig] = useState<string | null>(null);

  // Find first LP for close trade
  const lpIdx = useMemo(() => {
    const lp = accounts.find(({ account }) => account.kind === AccountKind.LP);
    return lp?.idx ?? 0;
  }, [accounts]);

  if (!userAccount) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
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
      ? "text-emerald-600"
      : "text-red-600";

  // Estimate margin health
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

  async function handleClose() {
    if (!userAccount || !hasPosition) return;
    try {
      // Close = trade opposite direction with same size
      const closeSize = isLong ? -absPosition : absPosition;
      const sig = await trade({
        lpIdx,
        userIdx: userAccount.idx,
        size: closeSize,
      });
      setCloseSig(sig ?? null);
    } catch {
      // error set by hook
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
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
                isLong ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {isLong ? "LONG" : "SHORT"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Size</span>
            <span className="text-sm text-gray-900">
              {formatTokenAmount(absPosition)} PERC
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Entry Price</span>
            <span className="text-sm text-gray-900">
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
              {account.pnl < 0n ? " (loss)" : ""} PERC
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Margin Health</span>
            <span className="text-sm text-gray-400">{liqPriceStr}</span>
          </div>

          {/* Close position button */}
          <button
            onClick={handleClose}
            disabled={closeLoading}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {closeLoading ? "Closing..." : "Close Position"}
          </button>

          {closeError && (
            <p className="text-xs text-red-600">{closeError}</p>
          )}

          {closeSig && (
            <p className="text-xs text-gray-500">
              Closed:{" "}
              <a
                href={`https://explorer.solana.com/tx/${closeSig}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {closeSig.slice(0, 16)}...
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
};
