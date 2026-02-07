"use client";

import { FC } from "react";
import { useEngineState } from "@/hooks/useEngineState";
import { formatTokenAmount } from "@/lib/format";

export const InsuranceFund: FC = () => {
  const { insuranceFund, loading } = useEngineState();

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-gray-500">Loading insurance fund...</p>
      </div>
    );
  }

  if (!insuranceFund) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-gray-500">Market not loaded</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-8 shadow-sm">
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-emerald-600">
        Insurance Fund (Locked Forever)
      </h2>
      <p className="text-4xl font-bold text-gray-900">
        {formatTokenAmount(insuranceFund.balance)} PERC
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Fee Revenue: {formatTokenAmount(insuranceFund.feeRevenue)} PERC
      </p>
    </div>
  );
};
