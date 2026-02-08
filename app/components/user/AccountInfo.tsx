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
      <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 text-center shadow-sm">
        <p className="text-[#71717a]">Connect your wallet to view account</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
        <p className="text-[#71717a]">Loading account...</p>
      </div>
    );
  }

  if (!userAccount) {
    return (
      <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-[#71717a]">
          Account
        </h3>
        <p className="text-sm text-[#71717a]">No account found for this wallet.</p>
        <p className="mt-1 text-xs text-[#52525b]">
          Create an account from the Dashboard to start trading.
        </p>
      </div>
    );
  }

  const { account, idx } = userAccount;
  const equity = account.capital + (account.pnl > 0n ? account.pnl : 0n);

  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[#71717a]">
        Account
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#71717a]">Index</span>
          <span className="text-sm text-[#e4e4e7]">{idx}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#71717a]">Type</span>
          <span className="text-sm text-[#e4e4e7]">
            {account.kind === AccountKind.LP ? "LP" : "User"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#71717a]">Capital</span>
          <span className="text-sm text-[#e4e4e7]">
            {formatTokenAmount(account.capital)} {symbol}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#71717a]">PnL</span>
          <span
            className={`text-sm font-medium ${
              account.pnl === 0n
                ? "text-[#71717a]"
                : account.pnl > 0n
                  ? "text-emerald-400"
                  : "text-red-400"
            }`}
          >
            {account.pnl > 0n ? "+" : ""}
            {formatTokenAmount(account.pnl < 0n ? -account.pnl : account.pnl)}
            {account.pnl < 0n ? " (loss)" : ""}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#71717a]">Equity</span>
          <span className="text-sm font-medium text-[#e4e4e7]">
            {formatTokenAmount(equity)} {symbol}
          </span>
        </div>
      </div>
    </div>
  );
};
