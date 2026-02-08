"use client";

import { FC } from "react";
import { useEngineState } from "@/hooks/useEngineState";

export const FundingRate: FC = () => {
  const { fundingRate, engine, loading } = useEngineState();

  if (loading || !engine) {
    return (
      <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
        <p className="text-[#71717a]">Loading funding rate...</p>
      </div>
    );
  }

  const bpsPerSlot = Number(fundingRate ?? 0n);
  const slotsPerHour = 2.5 * 3600;
  const hourlyRate = bpsPerSlot * slotsPerHour;
  const annualizedRate = bpsPerSlot * 2.5 * 3600 * 24 * 365;

  const isPositive = bpsPerSlot > 0;
  const rateColor =
    bpsPerSlot === 0
      ? "text-[#71717a]"
      : isPositive
        ? "text-emerald-400"
        : "text-red-400";

  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[#71717a]">
        Funding Rate
      </h3>
      <div className="space-y-2">
        <div>
          <p className="text-xs text-[#71717a]">Per Slot</p>
          <p className={`text-sm font-medium ${rateColor}`}>
            {bpsPerSlot.toFixed(6)} bps
          </p>
        </div>
        <div>
          <p className="text-xs text-[#71717a]">Hourly</p>
          <p className={`text-sm font-medium ${rateColor}`}>
            {hourlyRate.toFixed(4)} bps
          </p>
        </div>
        <div>
          <p className="text-xs text-[#71717a]">Annualized</p>
          <p className={`text-lg font-bold ${rateColor}`}>
            {(annualizedRate / 100).toFixed(2)}%
          </p>
        </div>
      </div>
    </div>
  );
};
