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
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-[#e4e4e7]">
          Percolator SOV
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-[#71717a]">
          A deflationary perpetual market on Solana. Every trade locks PERC
          tokens as fees&mdash;permanently. Admin key burned. No one can withdraw.
          Circulating supply only goes down.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/trade"
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Start Trading
          </Link>
          <Link
            href="/markets"
            className="rounded-xl border border-[#1e1e2e] px-6 py-3 text-sm font-medium text-[#e4e4e7] transition-colors hover:bg-[#1a1a2e]"
          >
            Browse Markets
          </Link>
        </div>
      </div>

      {/* Live Insurance Tracker */}
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
        <h2 className="mb-8 text-center text-3xl font-bold text-[#e4e4e7]">
          How It Works
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a2e] text-lg font-bold text-[#e4e4e7]">
              1
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[#e4e4e7]">
              Deposit PERC
            </h3>
            <p className="text-sm leading-relaxed text-[#71717a]">
              Connect your Solana wallet and deposit PERC tokens as collateral.
              You need a small account creation fee (1 PERC) to get started.
              Your collateral backs your perpetual positions.
            </p>
          </div>
          <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a2e] text-lg font-bold text-[#e4e4e7]">
              2
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[#e4e4e7]">
              Trade Long or Short
            </h3>
            <p className="text-sm leading-relaxed text-[#71717a]">
              Open leveraged perpetual positions on the PERC/USD pair. Go long
              if you think PERC will go up, or short if you think it will go
              down. The market uses an inverted perpetual design.
            </p>
          </div>
          <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a2e] text-lg font-bold text-[#e4e4e7]">
              3
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[#e4e4e7]">
              Fees Burned Forever
            </h3>
            <p className="text-sm leading-relaxed text-[#71717a]">
              Every trade pays a 0.30% fee. These fees go to the insurance fund.
              The admin key is burned&mdash;no one can ever withdraw. Fees are
              locked permanently, removing PERC from circulation.
            </p>
          </div>
        </div>
      </div>

      {/* SOV Economics Explainer */}
      <div className="mb-16">
        <h2 className="mb-8 text-center text-3xl font-bold text-[#e4e4e7]">
          The SOV Model
        </h2>
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold text-[#e4e4e7]">
              Inverted Perpetual
            </h3>
            <p className="text-sm leading-relaxed text-[#71717a]">
              This is an <strong className="text-[#e4e4e7]">inverted perpetual</strong> &mdash;
              PERC is both the collateral and the settlement asset.
              When you trade, you deposit and withdraw PERC tokens. PnL is
              denominated in PERC. This means the market&apos;s economic activity
              directly affects the token&apos;s circulating supply.
            </p>
          </div>
          <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold text-[#e4e4e7]">
              Deflationary by Design
            </h3>
            <p className="text-sm leading-relaxed text-[#71717a]">
              Trading fees (0.30% per trade) accumulate in the on-chain insurance
              fund. The admin keypair has been burned &mdash; there is no
              privileged key that can call <code className="rounded bg-[#1a1a2e] px-1 text-xs">WithdrawInsurance</code>.
              These tokens are permanently locked in the program&apos;s vault.
              Every trade shrinks the circulating supply of PERC.
            </p>
          </div>
          <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold text-[#e4e4e7]">
              Formally Verified Risk Engine
            </h3>
            <p className="text-sm leading-relaxed text-[#71717a]">
              The on-chain risk engine uses an O(1) haircut-ratio model for
              solvency, with real-time funding rates, maintenance margin
              requirements, and automatic liquidation. The engine cranks every
              5 seconds, updating funding rates and checking positions.
            </p>
          </div>
          <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold text-[#e4e4e7]">
              Live Oracle Price
            </h3>
            <p className="text-sm leading-relaxed text-[#71717a]">
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
        <h2 className="mb-8 text-center text-3xl font-bold text-[#e4e4e7]">
          Market Parameters
        </h2>
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] shadow-sm">
            <div className="grid grid-cols-2 gap-px bg-[#1e1e2e]">
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
                <div key={label} className="bg-[#12121a] p-4">
                  <p className="text-xs text-[#71717a]">{label}</p>
                  <p className="text-sm font-medium text-[#e4e4e7]">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Addresses */}
      <div className="mb-12">
        <h2 className="mb-8 text-center text-3xl font-bold text-[#e4e4e7]">
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
              className="flex items-center justify-between rounded-lg border border-[#1e1e2e] bg-[#12121a] px-4 py-3 shadow-sm"
            >
              <span className="text-sm font-medium text-[#e4e4e7]">{label}</span>
              <a
                href={`https://solscan.io/account/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-blue-400 hover:underline"
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
          className="inline-block rounded-xl bg-blue-600 px-8 py-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Start Trading
        </Link>
        <p className="mt-4 text-sm text-[#71717a]">
          Open source &mdash;{" "}
          <a
            href="https://github.com/MidTermDev/percolator-sov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            View on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
