"use client";

import { DepositWithdrawCard } from "@/components/trade/DepositWithdrawCard";
import { MarketStatsCard } from "@/components/trade/MarketStatsCard";
import { EngineHealthCard } from "@/components/trade/EngineHealthCard";
import { MarketBookCard } from "@/components/trade/MarketBookCard";
import { AccountsCard } from "@/components/trade/AccountsCard";

export default function TradePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Row 1: Deposit/Withdraw | Market Stats (2x wide) | Engine Health */}
      <div className="mb-4 grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <DepositWithdrawCard />
        </div>
        <div className="lg:col-span-2">
          <MarketStatsCard />
        </div>
        <div className="lg:col-span-1">
          <EngineHealthCard />
        </div>
      </div>

      {/* Row 2: Market Book + LP depth | Open Positions / Idle Accounts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MarketBookCard />
        <AccountsCard />
      </div>
    </div>
  );
}
