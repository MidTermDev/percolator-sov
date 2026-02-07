"use client";

import { FC } from "react";
import { useEngineState } from "@/hooks/useEngineState";
import { useMarketConfig } from "@/hooks/useMarketConfig";
import { useSlabState } from "@/components/providers/SlabProvider";
import { formatTokenAmount, formatUsd, formatBps } from "@/lib/format";

export const MarketStats: FC = () => {
  const { engine, params, loading } = useEngineState();
  const { error } = useSlabState();
  const config = useMarketConfig();

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-gray-500">Loading market stats...</p>
      </div>
    );
  }

  if (!engine || !config || !params) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-gray-500">Market not loaded</p>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  const stats = [
    {
      label: "Oracle Price",
      value: formatUsd(config.lastEffectivePriceE6),
    },
    {
      label: "Total Open Interest",
      value: `${formatTokenAmount(engine.totalOpenInterest)} PERC`,
    },
    {
      label: "Vault Balance",
      value: `${formatTokenAmount(engine.vault)} PERC`,
    },
    {
      label: "Trading Fee",
      value: formatBps(params.tradingFeeBps),
    },
    {
      label: "Maintenance Margin",
      value: formatBps(params.maintenanceMarginBps),
    },
    {
      label: "Accounts Used",
      value: engine.numUsedAccounts.toString(),
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        Market Stats
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-sm font-medium text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
