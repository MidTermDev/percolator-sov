"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { useSlabState } from "@/components/providers/SlabProvider";
import {
  detectDexType,
  parseDexPool,
  computeDexSpotPriceE6,
  type DexType,
} from "@percolator/core";

const POLL_MS = 5_000;
const ALL_ZEROS = new PublicKey("11111111111111111111111111111111");

type OracleMode = "admin" | "pyth" | "unknown" | DexType;

/**
 * Fetches the live token/USD price every 5 seconds.
 *
 * - Pyth oracle markets: uses Hermes API
 * - Admin oracle markets: uses DexScreener as fallback
 * - DEX oracle markets: reads pool account via RPC and computes spot price
 */
export function useLivePrice() {
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [priceE6, setPriceE6] = useState<bigint | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const { config: mktConfig } = useSlabState();
  const { connection } = useConnection();

  const mint = mktConfig?.collateralMint?.toBase58() ?? null;

  // Detect oracle mode from indexFeedId
  const oracleInfo = useMemo(() => {
    if (!mktConfig?.indexFeedId) return { mode: "admin" as OracleMode, feedIdHex: null };
    if (mktConfig.indexFeedId.equals(ALL_ZEROS) || mktConfig.indexFeedId.equals(PublicKey.default)) {
      return { mode: "admin" as OracleMode, feedIdHex: null };
    }
    // Convert PublicKey bytes to hex
    const bytes = mktConfig.indexFeedId.toBytes();
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { mode: "unknown" as OracleMode, feedIdHex: hex, poolPubkey: mktConfig.indexFeedId };
  }, [mktConfig?.indexFeedId]);

  // Resolve DEX vs Pyth on first load when mode is unknown
  const [resolvedMode, setResolvedMode] = useState<OracleMode | null>(null);
  const [dexType, setDexType] = useState<DexType | null>(null);

  useEffect(() => {
    setResolvedMode(null);
    setDexType(null);

    if (oracleInfo.mode !== "unknown" || !oracleInfo.poolPubkey) {
      setResolvedMode(oracleInfo.mode === "unknown" ? "pyth" : oracleInfo.mode);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const info = await connection.getAccountInfo(oracleInfo.poolPubkey!);
        if (cancelled) return;
        if (info) {
          const detected = detectDexType(new PublicKey(info.owner));
          if (detected) {
            setDexType(detected);
            setResolvedMode(detected);
            return;
          }
        }
      } catch {
        // fall through
      }
      if (!cancelled) setResolvedMode("pyth");
    })();

    return () => { cancelled = true; };
  }, [connection, oracleInfo.mode, oracleInfo.poolPubkey?.toBase58()]);

  const effectiveMode = resolvedMode ?? oracleInfo.mode;

  const fetchDexPrice = useCallback(async () => {
    if (!oracleInfo.poolPubkey || !dexType) return;
    try {
      const poolInfo = await connection.getAccountInfo(oracleInfo.poolPubkey);
      if (!poolInfo) return;

      const poolData = new Uint8Array(poolInfo.data);
      let spotE6: bigint;

      if (dexType === "pumpswap") {
        const parsed = parseDexPool(dexType, oracleInfo.poolPubkey, poolData);
        if (!parsed.baseVault || !parsed.quoteVault) return;
        const [baseVaultInfo, quoteVaultInfo] = await connection.getMultipleAccountsInfo([
          parsed.baseVault,
          parsed.quoteVault,
        ]);
        if (!baseVaultInfo || !quoteVaultInfo) return;
        spotE6 = computeDexSpotPriceE6(dexType, poolData, {
          base: new Uint8Array(baseVaultInfo.data),
          quote: new Uint8Array(quoteVaultInfo.data),
        });
      } else {
        spotE6 = computeDexSpotPriceE6(dexType, poolData);
      }

      if (spotE6 > 0n) {
        const p = Number(spotE6) / 1_000_000;
        setPriceUsd(p);
        setPriceE6(spotE6);
      }
    } catch {
      // keep last known price
    }
  }, [connection, oracleInfo.poolPubkey?.toBase58(), dexType]);

  useEffect(() => {
    setPriceUsd(null);
    setPriceE6(null);

    if (effectiveMode === "unknown" || (!mint && effectiveMode !== "pyth" && !dexType)) return;

    async function fetchPythPrice() {
      try {
        const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${oracleInfo.feedIdHex}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const json = (await resp.json()) as any;
        const parsed = json.parsed;
        if (!parsed || parsed.length === 0) return;
        const priceData = parsed[0].price;
        const rawPrice = Number(priceData.price);
        const expo = Number(priceData.expo);
        const p = rawPrice * Math.pow(10, expo);
        if (p > 0) {
          setPriceUsd(p);
          setPriceE6(BigInt(Math.round(p * 1_000_000)));
        }
      } catch {
        // keep last known price
      }
    }

    async function fetchDexScreenerPrice() {
      try {
        const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const json = (await resp.json()) as any;
        const pairs = json.pairs || [];
        if (pairs.length === 0) return;
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

    let fetchPrice: () => Promise<void>;
    if (effectiveMode === "pyth") {
      fetchPrice = fetchPythPrice;
    } else if (dexType) {
      fetchPrice = fetchDexPrice;
    } else {
      fetchPrice = fetchDexScreenerPrice;
    }

    fetchPrice();
    timerRef.current = setInterval(fetchPrice, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [mint, oracleInfo.feedIdHex, effectiveMode, dexType, fetchDexPrice]);

  return { priceUsd, priceE6 };
}
