"use client";

import { FC } from "react";
import { useEngineState } from "@/hooks/useEngineState";

export const FundingRate: FC = () => {
  const { fundingRate, engine, loading } = useEngineState();

  if (loading || !engine) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-gray-500">Loading funding rate...</p>
      </div>
    );
  }

  // funding_rate_bps_per_slot_last is i64 (bps per slot)
  // Solana ~2.5 slots/sec, ~216000 slots/day, ~78.84M slots/year
  const bpsPerSlot = Number(fundingRate ?? 0n);
  const slotsPerHour = 2.5 * 3600;
  const hourlyRate = bpsPerSlot * slotsPerHour;
  const annualizedRate = bpsPerSlot * 2.5 * 3600 * 24 * 365;

  const isPositive = bpsPerSlot > 0;
  const rateColor =
    bpsPerSlot === 0
      ? "text-gray-400"
      : isPositive
        ? "text-emerald-600"
        : "text-red-600";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        Funding Rate
      </h3>
      <div className="space-y-2">
        <div>
          <p className="text-xs text-gray-500">Per Slot</p>
          <p className={`text-sm font-medium ${rateColor}`}>
            {bpsPerSlot.toFixed(6)} bps
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Hourly</p>
          <p className={`text-sm font-medium ${rateColor}`}>
            {hourlyRate.toFixed(4)} bps
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Annualized</p>
          <p className={`text-lg font-bold ${rateColor}`}>
            {(annualizedRate / 100).toFixed(2)}%
          </p>
        </div>
      </div>
    </div>
  );
};
