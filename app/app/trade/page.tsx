"use client";

import { TradeForm } from "@/components/trade/TradeForm";
import { PositionPanel } from "@/components/trade/PositionPanel";
import { MarketStats } from "@/components/market/MarketStats";
import { FundingRate } from "@/components/market/FundingRate";
import { InsuranceFund } from "@/components/market/InsuranceFund";

export default function TradePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Trade</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Trade form */}
        <div className="space-y-6">
          <TradeForm />
        </div>

        {/* Middle: Position + Market stats */}
        <div className="space-y-6">
          <PositionPanel />
          <MarketStats />
        </div>

        {/* Right: Insurance + Funding */}
        <div className="space-y-6">
          <InsuranceFund />
          <FundingRate />
        </div>
      </div>
    </div>
  );
}
