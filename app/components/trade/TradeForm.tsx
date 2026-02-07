"use client";

import { FC, useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTrade } from "@/hooks/useTrade";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useEngineState } from "@/hooks/useEngineState";
import { useSlabState } from "@/components/providers/SlabProvider";
import { AccountKind } from "@percolator/core";

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10];

function formatPerc(native: bigint): string {
  return (native / 1_000_000n).toLocaleString();
}

function parsePercToNative(input: string): bigint {
  const parts = input.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(frac);
}

export const TradeForm: FC = () => {
  const { connected } = useWallet();
  const userAccount = useUserAccount();
  const { trade, loading, error } = useTrade();
  const { params } = useEngineState();
  const { accounts } = useSlabState();

  const [direction, setDirection] = useState<"long" | "short">("long");
  const [marginInput, setMarginInput] = useState("");
  const [leverage, setLeverage] = useState(2);
  const [lastSig, setLastSig] = useState<string | null>(null);

  // Find first LP account to use as counterparty
  const lpIdx = useMemo(() => {
    const lp = accounts.find(({ account }) => account.kind === AccountKind.LP);
    return lp?.idx ?? 0;
  }, [accounts]);

  const maxLeverage = params
    ? Number(10000n / params.initialMarginBps)
    : 10;

  // Filter leverage options to those <= max
  const availableLeverage = LEVERAGE_OPTIONS.filter((l) => l <= maxLeverage);
  if (availableLeverage.length === 0 || availableLeverage[availableLeverage.length - 1] < maxLeverage) {
    availableLeverage.push(maxLeverage);
  }

  const balance = userAccount ? userAccount.account.capital : 0n;

  // Compute position size from margin input
  const marginNative = marginInput ? parsePercToNative(marginInput) : 0n;
  const positionSize = marginNative * BigInt(leverage);

  if (!connected) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-gray-400">Connect your wallet to trade</p>
      </div>
    );
  }

  if (!userAccount) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-gray-400">
          No account found. Go to Dashboard to create one.
        </p>
      </div>
    );
  }

  async function handleTrade() {
    if (!marginInput || !userAccount || positionSize <= 0n) return;

    try {
      const size = direction === "short" ? -positionSize : positionSize;
      const sig = await trade({
        lpIdx,
        userIdx: userAccount.idx,
        size,
      });
      setLastSig(sig ?? null);
      setMarginInput("");
    } catch {
      // error is set by hook
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        Trade
      </h3>

      {/* Direction toggle */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setDirection("long")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            direction === "long"
              ? "bg-emerald-600 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          Long
        </button>
        <button
          onClick={() => setDirection("short")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            direction === "short"
              ? "bg-red-600 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          Short
        </button>
      </div>

      {/* Margin input */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs text-gray-500">Margin (PERC)</label>
          <button
            onClick={() => {
              if (balance > 0n) setMarginInput((balance / 1_000_000n).toString());
            }}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Balance: {formatPerc(balance)}
          </button>
        </div>
        <input
          type="text"
          value={marginInput}
          onChange={(e) => setMarginInput(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="100000"
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Leverage selector */}
      <div className="mb-4">
        <label className="mb-1 block text-xs text-gray-500">Leverage</label>
        <div className="flex gap-1.5">
          {availableLeverage.map((l) => (
            <button
              key={l}
              onClick={() => setLeverage(l)}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                leverage === l
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {l}x
            </button>
          ))}
        </div>
      </div>

      {/* Position summary */}
      {marginInput && marginNative > 0n && (
        <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Position Size</span>
            <span className="font-medium text-gray-900">
              {formatPerc(positionSize)} PERC
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Direction</span>
            <span
              className={`font-medium ${
                direction === "long" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {direction === "long" ? "Long" : "Short"} {leverage}x
            </span>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleTrade}
        disabled={loading || !marginInput || positionSize <= 0n}
        className={`w-full rounded-lg py-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          direction === "long"
            ? "bg-emerald-600 hover:bg-emerald-700"
            : "bg-red-600 hover:bg-red-700"
        }`}
      >
        {loading
          ? "Sending..."
          : `${direction === "long" ? "Long" : "Short"} ${leverage}x`}
      </button>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      {lastSig && (
        <p className="mt-2 text-xs text-gray-500">
          Tx:{" "}
          <a
            href={`https://explorer.solana.com/tx/${lastSig}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {lastSig.slice(0, 16)}...
          </a>
        </p>
      )}
    </div>
  );
};
