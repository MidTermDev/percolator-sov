"use client";

import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

import { FC, ReactNode } from "react";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { MarketProvider } from "@/components/providers/MarketProvider";

export const Providers: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <WalletProvider>
      <MarketProvider>{children}</MarketProvider>
    </WalletProvider>
  );
};
