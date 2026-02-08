"use client";

import { InsuranceFund } from "@/components/market/InsuranceFund";
import { MarketStats } from "@/components/market/MarketStats";
import { FundingRate } from "@/components/market/FundingRate";
import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      {/* Hero */}
      <div className="mb-16 text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-gray-900">
          Percolator SOV
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-500">
          A deflationary perpetual market on Solana. Every trade locks PERC
          tokens as fees&mdash;permanently. Admin key burned. No one can withdraw.
          Circulating supply only goes down.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/trade"
            className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Start Trading
          </Link>
          <Link
            href="/markets"
            className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Browse Markets
          </Link>
        </div>
      </div>

      {/* Live Insurance Tracker — prominent */}
      <div className="mb-12">
        <InsuranceFund />
      </div>

      {/* Market Stats & Funding */}
      <div className="mb-16 grid gap-6 md:grid-cols-2">
        <MarketStats />
        <FundingRate />
      </div>

      {/* How It Works */}
      <div id="how-it-works" className="mb-16">
        <h2 className="mb-8 text-center text-3xl font-bold text-gray-900">
          How It Works
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-700">
              1
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Deposit PERC
            </h3>
            <p className="text-sm leading-relaxed text-gray-500">
              Connect your Solana wallet and deposit PERC tokens as collateral.
              You need a small account creation fee (1 PERC) to get started.
              Your collateral backs your perpetual positions.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-700">
              2
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Trade Long or Short
            </h3>
            <p className="text-sm leading-relaxed text-gray-500">
              Open leveraged perpetual positions on the PERC/USD pair. Go long
              if you think PERC will go up, or short if you think it will go
              down. The market uses an inverted perpetual design.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-700">
              3
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Fees Burned Forever
            </h3>
            <p className="text-sm leading-relaxed text-gray-500">
              Every trade pays a 0.30% fee. These fees go to the insurance fund.
              The admin key is burned&mdash;no one can ever withdraw. Fees are
              locked permanently, removing PERC from circulation.
            </p>
          </div>
        </div>
      </div>

      {/* SOV Economics Explainer */}
      <div className="mb-16">
        <h2 className="mb-8 text-center text-3xl font-bold text-gray-900">
          The SOV Model
        </h2>
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Inverted Perpetual
            </h3>
            <p className="text-sm leading-relaxed text-gray-500">
              This is an <strong className="text-gray-700">inverted perpetual</strong> &mdash;
              PERC is both the collateral and the settlement asset.
              When you trade, you deposit and withdraw PERC tokens. PnL is
              denominated in PERC. This means the market&apos;s economic activity
              directly affects the token&apos;s circulating supply.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Deflationary by Design
            </h3>
            <p className="text-sm leading-relaxed text-gray-500">
              Trading fees (0.30% per trade) accumulate in the on-chain insurance
              fund. The admin keypair has been burned &mdash; there is no
              privileged key that can call <code className="rounded bg-gray-100 px-1 text-xs">WithdrawInsurance</code>.
              These tokens are permanently locked in the program&apos;s vault.
              Every trade shrinks the circulating supply of PERC.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Formally Verified Risk Engine
            </h3>
            <p className="text-sm leading-relaxed text-gray-500">
              The on-chain risk engine uses an O(1) haircut-ratio model for
              solvency, with real-time funding rates, maintenance margin
              requirements, and automatic liquidation. The engine cranks every
              5 seconds, updating funding rates and checking positions.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Live Oracle Price
            </h3>
            <p className="text-sm leading-relaxed text-gray-500">
              The PERC/USD oracle price is fetched from DexScreener (Meteora
              liquidity pools) and pushed on-chain every 10 seconds. A 5%
              per-push circuit breaker prevents wild price swings. The
              crank bot runs continuously, ensuring the market stays in sync
              with real-world PERC prices.
            </p>
          </div>
        </div>
      </div>

      {/* Key Parameters */}
      <div className="mb-16">
        <h2 className="mb-8 text-center text-3xl font-bold text-gray-900">
          Market Parameters
        </h2>
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="grid grid-cols-2 gap-px bg-gray-100">
              {[
                ["Collateral", "PERC (SPL token)"],
                ["Trading Fee", "0.30% per trade"],
                ["Initial Margin", "10% (10x max leverage)"],
                ["Maintenance Margin", "5%"],
                ["Liquidation Fee", "1%"],
                ["Oracle", "DexScreener (Meteora pools)"],
                ["Crank Interval", "5 seconds"],
                ["Price Cap", "5% per push"],
                ["Account Fee", "1 PERC"],
                ["Admin Key", "Burned (irreversible)"],
              ].map(([label, value]) => (
                <div key={label} className="bg-white p-4">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-sm font-medium text-gray-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Addresses */}
      <div className="mb-12">
        <h2 className="mb-8 text-center text-3xl font-bold text-gray-900">
          On-Chain Addresses
        </h2>
        <div className="mx-auto max-w-3xl space-y-3">
          {[
            ["Program", "GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24"],
            ["Market (Slab)", "687iGEQWXbhR8wqovYmdgZfLy9nQurrmnxNiaVqJydwc"],
            ["PERC Mint", "A16Gd8AfaPnG6rohE6iPFDf6mr9gk519d6aMUJAperc"],
            ["Matcher Program", "DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX"],
          ].map(([label, address]) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <a
                href={`https://solscan.io/account/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-blue-600 hover:underline"
              >
                {address}
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/trade"
          className="inline-block rounded-xl bg-gray-900 px-8 py-4 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Start Trading
        </Link>
        <p className="mt-4 text-sm text-gray-400">
          Open source &mdash;{" "}
          <a
            href="https://github.com/MidTermDev/percolator-sov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            View on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
