"use client";

import { MarketBrowser } from "@/components/market/MarketBrowser";

export default function MarketsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold text-[#e4e4e7]">Markets</h1>
      <p className="mb-8 text-[#71717a]">
        Browse all Percolator perpetual markets. Click Trade to open a market.
      </p>
      <MarketBrowser />
    </div>
  );
}
