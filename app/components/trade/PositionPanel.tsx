"use client";

import { FC, useMemo, useState } from "react";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useMarketConfig } from "@/hooks/useMarketConfig";
import { useTrade } from "@/hooks/useTrade";
import { useSlabState } from "@/components/providers/SlabProvider";
import { AccountKind } from "@percolator/core";
import { formatTokenAmount, formatUsd } from "@/lib/format";
import { useLivePrice } from "@/hooks/useLivePrice";

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export const PositionPanel: FC = () => {
  const userAccount = useUserAccount();
  const config = useMarketConfig();
  const { trade, loading: closeLoading, error: closeError } = useTrade();
  const { accounts } = useSlabState();
  const { priceE6: livePriceE6 } = useLivePrice();
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
  const absPosition = abs(account.positionSize);
  // Use live DexScreener price if available, fall back to on-chain oracle
  const onChainPriceE6 = config?.lastEffectivePriceE6 ?? 0n;
  const currentPriceE6 = livePriceE6 ?? onChainPriceE6;

  // Entry price is stored on-chain in reservedPnl (set when position opens).
  // This is stable — it doesn't change during crank settlements.
  // For positions opened before this upgrade, reservedPnl = 0 so we fall back
  // to the slab entry_price (approximate, last settlement price).
  const entryPriceE6 = account.reservedPnl > 0n
    ? account.reservedPnl
    : account.entryPrice;

  // Coin-margined PnL: pnl_perc = position * (currentPrice - entryPrice) / currentPrice
  let pnlPerc = 0n;
  if (hasPosition && currentPriceE6 > 0n && entryPriceE6 > 0n) {
    const priceDelta = currentPriceE6 - entryPriceE6;
    pnlPerc = (account.positionSize * priceDelta) / currentPriceE6;
  }

  const pnlColor =
    pnlPerc === 0n
      ? "text-gray-400"
      : pnlPerc > 0n
        ? "text-emerald-600"
        : "text-red-600";

  // Margin health: capital / |position| as percentage (position-based, matches on-chain)
  let marginHealthStr = "N/A";
  if (hasPosition && absPosition > 0n) {
    const healthPct = Number((account.capital * 100n) / absPosition);
    marginHealthStr = `${healthPct.toFixed(1)}%`;
  }

  async function handleClose() {
    if (!userAccount || !hasPosition) return;
    try {
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
              {formatUsd(entryPriceE6)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Current Price</span>
            <span className="text-sm text-gray-900">
              {formatUsd(currentPriceE6)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Unrealized PnL</span>
            <span className={`text-sm font-medium ${pnlColor}`}>
              {pnlPerc > 0n ? "+" : pnlPerc < 0n ? "-" : ""}
              {formatTokenAmount(abs(pnlPerc))} PERC
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Margin</span>
            <span className="text-sm text-gray-400">{marginHealthStr}</span>
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
