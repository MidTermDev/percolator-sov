"use client";

import { InsuranceFund } from "@/components/market/InsuranceFund";
import { MarketStats } from "@/components/market/MarketStats";
import { FundingRate } from "@/components/market/FundingRate";

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight">
          $PERC &mdash; Store of Value
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-400">
          An inverted perpetual market where PERC is the collateral. Trading
          fees accumulate in the insurance fund. Admin key burned. Fees locked
          forever. Circulating supply only goes down.
        </p>
      </div>

      {/* SOV Explainer */}
      <div className="mb-12 grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h3 className="mb-2 text-lg font-semibold text-white">
            Trade with PERC
          </h3>
          <p className="text-sm text-gray-400">
            Deposit PERC as collateral to open leveraged perpetual positions.
            Every trade pays a fee to the insurance fund.
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h3 className="mb-2 text-lg font-semibold text-white">
            Fees Locked Forever
          </h3>
          <p className="text-sm text-gray-400">
            The admin key has been burned. No one can withdraw fees from the
            insurance fund. They accumulate permanently.
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h3 className="mb-2 text-lg font-semibold text-white">
            Supply Shrinks
          </h3>
          <p className="text-sm text-gray-400">
            Every trade removes PERC from circulation into the vault. The more
            trading activity, the more deflationary PERC becomes.
          </p>
        </div>
      </div>

      {/* Live Insurance Tracker */}
      <div className="mb-8">
        <InsuranceFund />
      </div>

      {/* Market Stats & Funding */}
      <div className="grid gap-6 md:grid-cols-2">
        <MarketStats />
        <FundingRate />
      </div>
    </div>
  );
}
