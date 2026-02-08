"use client";

import { FC, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useDeposit } from "@/hooks/useDeposit";
import { useWithdraw } from "@/hooks/useWithdraw";
import { useInitUser } from "@/hooks/useInitUser";
import { useSlabState } from "@/components/providers/SlabProvider";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { parseHumanAmount } from "@/lib/parseAmount";

export const DepositWithdraw: FC = () => {
  const { connected } = useWallet();
  const userAccount = useUserAccount();
  const { deposit, loading: depositLoading, error: depositError } = useDeposit();
  const { withdraw, loading: withdrawLoading, error: withdrawError } = useWithdraw();
  const { initUser, loading: initLoading, error: initError } = useInitUser();
  const { config: mktConfig } = useSlabState();
  const tokenMeta = useTokenMeta(mktConfig?.collateralMint ?? null);
  const symbol = tokenMeta?.symbol ?? "Token";

  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [lastSig, setLastSig] = useState<string | null>(null);

  if (!connected) {
    return (
      <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 text-center shadow-sm">
        <p className="text-[#71717a]">Connect your wallet</p>
      </div>
    );
  }

  // No account - show init button
  if (!userAccount) {
    return (
      <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[#71717a]">
          Create Account
        </h3>
        <p className="mb-4 text-sm text-[#71717a]">
          You need an account to trade. This costs a small fee.
        </p>
        <button
          onClick={async () => {
            try {
              const sig = await initUser();
              setLastSig(sig ?? null);
            } catch {
              // error set by hook
            }
          }}
          disabled={initLoading}
          className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {initLoading ? "Creating..." : "Create Account"}
        </button>
        {initError && (
          <p className="mt-2 text-xs text-red-400">{initError}</p>
        )}
        {lastSig && (
          <p className="mt-2 text-xs text-[#71717a]">
            Tx:{" "}
            <a
              href={`https://explorer.solana.com/tx/${lastSig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {lastSig.slice(0, 16)}...
            </a>
          </p>
        )}
      </div>
    );
  }

  const loading = mode === "deposit" ? depositLoading : withdrawLoading;
  const error = mode === "deposit" ? depositError : withdrawError;

  async function handleSubmit() {
    if (!amount || !userAccount) return;

    try {
      const decimals = tokenMeta?.decimals ?? 6;
      const amtNative = parseHumanAmount(amount, decimals);

      if (amtNative <= 0n) throw new Error("Amount must be greater than 0");

      let sig: string | undefined;
      if (mode === "deposit") {
        sig = await deposit({ userIdx: userAccount.idx, amount: amtNative });
      } else {
        sig = await withdraw({ userIdx: userAccount.idx, amount: amtNative });
      }

      setLastSig(sig ?? null);
      setAmount("");
    } catch {
      // error set by hook
    }
  }

  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[#71717a]">
        Deposit / Withdraw
      </h3>

      {/* Mode toggle */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setMode("deposit")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === "deposit"
              ? "bg-emerald-600 text-white"
              : "bg-[#1a1a2e] text-[#71717a] hover:bg-[#1e1e2e]"
          }`}
        >
          Deposit
        </button>
        <button
          onClick={() => setMode("withdraw")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === "withdraw"
              ? "bg-amber-600 text-white"
              : "bg-[#1a1a2e] text-[#71717a] hover:bg-[#1e1e2e]"
          }`}
        >
          Withdraw
        </button>
      </div>

      {/* Amount input */}
      <div className="mb-4">
        <label className="mb-1 block text-xs text-[#71717a]">
          Amount ({symbol})
        </label>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="2000000"
          className="w-full rounded-lg border border-[#1e1e2e] bg-[#1a1a28] px-3 py-2 text-[#e4e4e7] placeholder-[#52525b] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading || !amount}
        className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? "Sending..."
          : mode === "deposit"
            ? `Deposit ${symbol}`
            : `Withdraw ${symbol}`}
      </button>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {lastSig && (
        <p className="mt-2 text-xs text-[#71717a]">
          Tx:{" "}
          <a
            href={`https://explorer.solana.com/tx/${lastSig}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            {lastSig.slice(0, 16)}...
          </a>
        </p>
      )}
    </div>
  );
};
