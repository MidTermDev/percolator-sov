"use client";

import { useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";

const POLL_MS = 5_000;

/**
 * Fetches the live PERC/USD price from DexScreener every 5 seconds.
 * Returns the price as a floating-point USD value and an e6 bigint.
 * Falls back to null if fetch fails.
 */
export function useLivePrice() {
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [priceE6, setPriceE6] = useState<bigint | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    const mint = config.percMint;
    if (!mint) return;

    async function fetchPrice() {
      try {
        const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const json = (await resp.json()) as any;
        const pairs = json.pairs || [];
        if (pairs.length === 0) return;
        // Use highest-liquidity pair
        const sorted = pairs.sort(
          (a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0),
        );
        const p = parseFloat(sorted[0].priceUsd);
        if (p > 0) {
          setPriceUsd(p);
          setPriceE6(BigInt(Math.round(p * 1_000_000)));
        }
      } catch {
        // keep last known price
      }
    }

    fetchPrice();
    timerRef.current = setInterval(fetchPrice, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  return { priceUsd, priceE6 };
}
