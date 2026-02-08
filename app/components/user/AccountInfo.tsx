"use client";

import { FC } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useSlabState } from "@/components/providers/SlabProvider";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { formatTokenAmount } from "@/lib/format";
import { AccountKind } from "@percolator/core";

export const AccountInfo: FC = () => {
  const { connected, publicKey } = useWallet();
  const userAccount = useUserAccount();
  const { loading, config: mktConfig } = useSlabState();
  const tokenMeta = useTokenMeta(mktConfig?.collateralMint ?? null);
  const symbol = tokenMeta?.symbol ?? "Token";

  if (!connected) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-gray-400">Connect your wallet to view account</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-gray-500">Loading account...</p>
      </div>
    );
  }

  if (!userAccount) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-400">
          Account
        </h3>
        <p className="text-sm text-gray-500">No account found for this wallet.</p>
        <p className="mt-1 text-xs text-gray-400">
          Create an account from the Dashboard to start trading.
        </p>
      </div>
    );
  }

  const { account, idx } = userAccount;
  const equity = account.capital + (account.pnl > 0n ? account.pnl : 0n);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
        Account
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Index</span>
          <span className="text-sm text-gray-900">{idx}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Type</span>
          <span className="text-sm text-gray-900">
            {account.kind === AccountKind.LP ? "LP" : "User"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Capital</span>
          <span className="text-sm text-gray-900">
            {formatTokenAmount(account.capital)} {symbol}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">PnL</span>
          <span
            className={`text-sm font-medium ${
              account.pnl === 0n
                ? "text-gray-400"
                : account.pnl > 0n
                  ? "text-emerald-600"
                  : "text-red-600"
            }`}
          >
            {account.pnl > 0n ? "+" : ""}
            {formatTokenAmount(account.pnl < 0n ? -account.pnl : account.pnl)}
            {account.pnl < 0n ? " (loss)" : ""}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Equity</span>
          <span className="text-sm font-medium text-gray-900">
            {formatTokenAmount(equity)} {symbol}
          </span>
        </div>
      </div>
    </div>
  );
};
