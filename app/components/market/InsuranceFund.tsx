"use client";

import { FC } from "react";
import { useEngineState } from "@/hooks/useEngineState";
import { useSlabState } from "@/components/providers/SlabProvider";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { formatTokenAmount } from "@/lib/format";

export const InsuranceFund: FC = () => {
  const { insuranceFund, loading } = useEngineState();
  const { config: mktConfig } = useSlabState();
  const tokenMeta = useTokenMeta(mktConfig?.collateralMint ?? null);
  const symbol = tokenMeta?.symbol ?? "Token";

  if (loading) {
    return (
      <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-8 text-center shadow-sm">
        <p className="text-[#71717a]">Loading insurance fund...</p>
      </div>
    );
  }

  if (!insuranceFund) {
    return (
      <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-8 text-center shadow-sm">
        <p className="text-[#71717a]">Market not loaded</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-900/50 bg-gradient-to-br from-[#12121a] to-emerald-950/30 p-8 shadow-sm">
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-emerald-400">
        Insurance Fund (Locked Forever)
      </h2>
      <p className="text-4xl font-bold text-[#e4e4e7]">
        {formatTokenAmount(insuranceFund.balance)} {symbol}
      </p>
      <p className="mt-2 text-sm text-[#71717a]">
        Fee Revenue: {formatTokenAmount(insuranceFund.feeRevenue)} {symbol}
      </p>
    </div>
  );
};
