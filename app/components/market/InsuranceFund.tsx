"use client";

import { FC } from "react";
import { useEngineState } from "@/hooks/useEngineState";
import { formatTokenAmount } from "@/lib/format";

export const InsuranceFund: FC = () => {
  const { insuranceFund, loading } = useEngineState();

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-500">Loading insurance fund...</p>
      </div>
    );
  }

  if (!insuranceFund) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-500">Market not loaded</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-900/50 bg-gradient-to-br from-gray-900 to-emerald-950/30 p-8">
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-emerald-400">
        Insurance Fund (Locked Forever)
      </h2>
      <p className="text-4xl font-bold text-white">
        {formatTokenAmount(insuranceFund.balance)} PERC
      </p>
      <p className="mt-2 text-sm text-gray-400">
        Fee Revenue: {formatTokenAmount(insuranceFund.feeRevenue)} PERC
      </p>
    </div>
  );
};
