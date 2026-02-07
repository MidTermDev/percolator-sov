"use client";

import { FC } from "react";
import Link from "next/link";
import Image from "next/image";
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
    <header className="px-4 pt-4">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between rounded-2xl border border-gray-200 bg-white/80 px-6 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Image src="/logo.png" alt="Percolator" width={28} height={28} className="rounded-md" />
            Percolator SOV
          </Link>
          <nav className="flex gap-6">
            <Link
              href="/"
              className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
              Home
            </Link>
            <Link
              href="/trade"
              className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
              Trade
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
              Dashboard
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/MidTermDev/percolator-sov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 transition-colors hover:text-gray-900"
            aria-label="GitHub"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
};
