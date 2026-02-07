"use client";

import { FC } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export const Header: FC = () => {
  return (
    <header className="border-b border-gray-800 bg-gray-950">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-white">
            Percolator SOV
          </Link>
          <nav className="flex gap-6">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Home
            </Link>
            <Link
              href="/trade"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Trade
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
          </nav>
        </div>
        <WalletMultiButton />
      </div>
    </header>
  );
};
