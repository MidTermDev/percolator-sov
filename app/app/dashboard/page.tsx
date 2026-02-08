"use client";

import { AccountInfo } from "@/components/user/AccountInfo";
import { DepositWithdraw } from "@/components/user/DepositWithdraw";
import { InsuranceFund } from "@/components/market/InsuranceFund";
import { MarketStats } from "@/components/market/MarketStats";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold text-[#e4e4e7]">Dashboard</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Account info + Deposit/Withdraw */}
        <div className="space-y-6">
          <AccountInfo />
          <DepositWithdraw />
        </div>

        {/* Right: Market overview */}
        <div className="space-y-6">
          <InsuranceFund />
          <MarketStats />
        </div>
      </div>
    </div>
  );
}
