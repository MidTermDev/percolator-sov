"use client";

import { FC, useState, useMemo, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import Link from "next/link";
import { useCreateMarket, type CreateMarketParams } from "@/hooks/useCreateMarket";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { usePythFeedSearch } from "@/hooks/usePythFeedSearch";
import { useDexPoolSearch, type DexPoolResult } from "@/hooks/useDexPoolSearch";
import { parseHumanAmount, formatHumanAmount } from "@/lib/parseAmount";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function isValidBase58Pubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

function isValidHex64(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}

// --------------------------------------------------------------------------
// Step components
// --------------------------------------------------------------------------

interface StepProps {
  open: boolean;
  onToggle: () => void;
  title: string;
  stepNum: number;
  valid: boolean;
  children: React.ReactNode;
}

const StepSection: FC<StepProps> = ({ open, onToggle, title, stepNum, valid, children }) => (
  <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-5 py-4 text-left"
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            valid ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {valid ? "\u2713" : stepNum}
        </span>
        <span className="text-sm font-semibold text-gray-900">{title}</span>
      </div>
      <svg
        className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {open && <div className="border-t border-gray-100 px-5 py-4">{children}</div>}
  </div>
);

const FieldHint: FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-1 text-xs text-gray-400">{children}</p>
);

// --------------------------------------------------------------------------
// Main wizard
// --------------------------------------------------------------------------

export const CreateMarketWizard: FC = () => {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { state, create, reset } = useCreateMarket();

  // Form state
  const [mint, setMint] = useState("");
  const [oracleMode, setOracleMode] = useState<"pyth" | "dex">("dex");
  const [feedId, setFeedId] = useState("");
  const [selectedFeedName, setSelectedFeedName] = useState<string | null>(null);
  const [selectedDexPool, setSelectedDexPool] = useState<DexPoolResult | null>(null);
  const [dexPoolAddress, setDexPoolAddress] = useState("");
  const [invert, setInvert] = useState(false);

  const [tradingFeeBps, setTradingFeeBps] = useState(30);
  const [initialMarginBps, setInitialMarginBps] = useState(1000);

  const [lpCollateral, setLpCollateral] = useState("");
  const [insuranceAmount, setInsuranceAmount] = useState("");
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [openStep, setOpenStep] = useState(1);

  // Token metadata
  const mintValid = isValidBase58Pubkey(mint);
  const mintPk = useMemo(() => (mintValid ? new PublicKey(mint) : null), [mint, mintValid]);
  const tokenMeta = useTokenMeta(mintPk);
  const decimals = tokenMeta?.decimals ?? 6;
  const symbol = tokenMeta?.symbol ?? "Token";

  // Pyth feed search (auto-search when symbol is known)
  const pythQuery = oracleMode === "pyth" && tokenMeta?.symbol ? tokenMeta.symbol : "";
  const { feeds: pythFeeds, loading: pythLoading } = usePythFeedSearch(pythQuery);

  // DEX pool search (auto-search when mint is set and DEX mode selected)
  const dexSearchMint = oracleMode === "dex" && mintValid ? mint : null;
  const { pools: dexPools, loading: dexPoolsLoading } = useDexPoolSearch(dexSearchMint);

  // Validation
  const dexPoolValid = oracleMode === "dex" && isValidBase58Pubkey(dexPoolAddress);
  const feedValid = oracleMode === "dex" || isValidHex64(feedId);
  const dexValid = oracleMode !== "dex" || dexPoolValid;
  const step1Valid = mintValid && feedValid && dexValid;

  const maintenanceMarginBps = Math.floor(initialMarginBps / 2);
  const maxLeverage = Math.floor(10000 / initialMarginBps);
  const step2Valid = tradingFeeBps >= 1 && tradingFeeBps <= 100 && initialMarginBps >= 100 && initialMarginBps <= 5000;

  const lpValid = lpCollateral !== "" && !isNaN(Number(lpCollateral)) && Number(lpCollateral) > 0;
  const insValid = insuranceAmount !== "" && !isNaN(Number(insuranceAmount)) && Number(insuranceAmount) > 0;
  const step3Valid = lpValid && insValid;

  const allValid = step1Valid && step2Valid && step3Valid;

  // Convert human amounts to native for balance comparison
  const lpNative = useMemo(() => {
    try { return lpValid ? parseHumanAmount(lpCollateral, decimals) : 0n; } catch { return 0n; }
  }, [lpCollateral, decimals, lpValid]);
  const insNative = useMemo(() => {
    try { return insValid ? parseHumanAmount(insuranceAmount, decimals) : 0n; } catch { return 0n; }
  }, [insuranceAmount, decimals, insValid]);
  const combinedNative = lpNative + insNative;

  const balanceWarning = tokenBalance !== null && combinedNative > 0n && combinedNative > (tokenBalance * 80n) / 100n;

  // Fetch balance when mint changes or wallet connects
  useEffect(() => {
    if (!publicKey || !mintValid) {
      setTokenBalance(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);

    (async () => {
      try {
        const pk = new PublicKey(mint);
        const ata = await getAssociatedTokenAddress(pk, publicKey);
        const account = await getAccount(connection, ata);
        if (!cancelled) setTokenBalance(account.amount);
      } catch {
        if (!cancelled) setTokenBalance(null);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [connection, publicKey, mint, mintValid]);

  const getOracleFeedAndPrice = (): { oracleFeed: string; priceE6: bigint } => {
    if (oracleMode === "dex") {
      // Store pool pubkey as hex in index_feed_id
      const pk = new PublicKey(dexPoolAddress);
      const hex = Array.from(pk.toBytes())
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return { oracleFeed: hex, priceE6: 0n };
    }
    // pyth
    return { oracleFeed: feedId, priceE6: 0n };
  };

  const handleCreate = () => {
    if (!allValid) return;

    const { oracleFeed, priceE6 } = getOracleFeedAndPrice();

    const params: CreateMarketParams = {
      mint: new PublicKey(mint),
      initialPriceE6: priceE6,
      lpCollateral: parseHumanAmount(lpCollateral, decimals),
      insuranceAmount: parseHumanAmount(insuranceAmount, decimals),
      oracleFeed,
      invert,
      tradingFeeBps,
      initialMarginBps,
    };

    create(params);
  };

  const handleRetry = () => {
    if (!allValid || !state.slabAddress) return;

    const { oracleFeed, priceE6 } = getOracleFeedAndPrice();

    const params: CreateMarketParams = {
      mint: new PublicKey(mint),
      initialPriceE6: priceE6,
      lpCollateral: parseHumanAmount(lpCollateral, decimals),
      insuranceAmount: parseHumanAmount(insuranceAmount, decimals),
      oracleFeed,
      invert,
      tradingFeeBps,
      initialMarginBps,
    };

    create(params, state.step);
  };

  // If creation is in progress or complete, show execution tracker
  if (state.loading || state.step > 0 || state.error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Creating Market</h2>

          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              let status: "pending" | "active" | "done" | "error" = "pending";
              if (state.step > i || state.step === 6) status = "done";
              else if (state.step === i && state.loading) status = "active";
              else if (state.step === i && state.error) status = "error";

              const labels = [
                "Create slab account",
                "Create vault token account",
                "Initialize market",
                "Initialize LP",
                "Deposit collateral & insurance",
                "Oracle setup & crank",
              ];

              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
                    {status === "done" && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs text-green-700">
                        &#10003;
                      </span>
                    )}
                    {status === "active" && (
                      <span className="flex h-6 w-6 items-center justify-center">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                      </span>
                    )}
                    {status === "error" && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs text-red-700">
                        !
                      </span>
                    )}
                    {status === "pending" && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400">
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-sm ${
                      status === "done"
                        ? "text-green-700"
                        : status === "active"
                          ? "font-medium text-gray-900"
                          : status === "error"
                            ? "text-red-700"
                            : "text-gray-400"
                    }`}
                  >
                    {labels[i]}
                  </span>
                </div>
              );
            })}
          </div>

          {state.error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3">
              <p className="text-sm text-red-700">{state.error}</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleRetry}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                >
                  Retry from step {state.step + 1}
                </button>
                <button
                  onClick={reset}
                  className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300"
                >
                  Start over
                </button>
              </div>
            </div>
          )}

          {state.step === 6 && state.slabAddress && (
            <div className="mt-4 rounded-lg bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">Market created successfully!</p>
              <p className="mt-1 font-mono text-xs text-green-700">
                Slab: {state.slabAddress}
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/trade?market=${state.slabAddress}`}
                  className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
                >
                  Trade this market
                </Link>
                <button
                  onClick={reset}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                >
                  Create another
                </button>
              </div>
            </div>
          )}

          {state.txSigs.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-400 uppercase">Transaction signatures</p>
              <div className="mt-1 space-y-1">
                {state.txSigs.map((sig, i) => (
                  <p key={i} className="font-mono text-xs text-gray-500 truncate">{sig}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: Token & Oracle */}
      <StepSection
        open={openStep === 1}
        onToggle={() => setOpenStep(openStep === 1 ? 0 : 1)}
        title="Token & Oracle"
        stepNum={1}
        valid={step1Valid}
      >
        <div className="space-y-4">
          {/* Collateral Mint */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Collateral Mint Address</label>
            <FieldHint>The SPL token used as collateral. Traders deposit this token and profits/losses are settled in it.</FieldHint>
            <input
              type="text"
              value={mint}
              onChange={(e) => setMint(e.target.value.trim())}
              placeholder="e.g. EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
              className={`mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs ${
                mint && !mintValid ? "border-red-300 bg-red-50" : "border-gray-200"
              } focus:border-gray-900 focus:outline-none`}
            />
            {mint && !mintValid && (
              <p className="mt-1 text-xs text-red-500">Invalid base58 public key</p>
            )}

            {/* Token info card */}
            {tokenMeta && mintValid && (
              <div className="mt-2 flex items-center gap-3 rounded-lg bg-blue-50 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  {tokenMeta.symbol.slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {tokenMeta.name} ({tokenMeta.symbol})
                  </p>
                  <p className="text-xs text-gray-500">{tokenMeta.decimals} decimals</p>
                </div>
              </div>
            )}

            {/* Wallet balance */}
            {balanceLoading && mintValid && (
              <p className="mt-1 text-xs text-gray-400">Loading balance...</p>
            )}
            {tokenBalance !== null && tokenMeta && (
              <p className="mt-1 text-xs text-gray-500">
                Your balance: <span className="font-medium text-gray-700">{formatHumanAmount(tokenBalance, tokenMeta.decimals)} {tokenMeta.symbol}</span>
              </p>
            )}
          </div>

          {/* Oracle Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Oracle Mode</label>
            <FieldHint>
              <strong>DEX Pool</strong> — uses an on-chain DEX pool as oracle. Works with any token that has a pool.{" "}
              <strong>Pyth</strong> — uses Pyth Network&apos;s decentralized price feeds for major assets.
            </FieldHint>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => { setOracleMode("dex"); setFeedId(""); setSelectedFeedName(null); }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  oracleMode === "dex"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                DEX Pool
              </button>
              <button
                type="button"
                onClick={() => { setOracleMode("pyth"); setDexPoolAddress(""); setSelectedDexPool(null); }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  oracleMode === "pyth"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Pyth Oracle
              </button>
            </div>
          </div>

          {/* Pyth Feed */}
          {oracleMode === "pyth" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Pyth Feed ID (hex, 64 chars)
              </label>

              {/* Auto-search results */}
              {pythFeeds.length > 0 && !feedId && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-500">Select a feed:</p>
                  {pythFeeds.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => { setFeedId(f.id); setSelectedFeedName(f.displayName); }}
                      className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50"
                    >
                      <span className="font-medium text-gray-900">{f.displayName}</span>
                      <span className="font-mono text-xs text-gray-400">{f.id.slice(0, 12)}...</span>
                    </button>
                  ))}
                </div>
              )}
              {pythLoading && <p className="mt-1 text-xs text-gray-400">Searching Pyth feeds...</p>}
              {!pythLoading && pythFeeds.length === 0 && tokenMeta?.symbol && (
                <p className="mt-1 text-xs text-gray-400">
                  No Pyth feeds found for &ldquo;{tokenMeta.symbol}&rdquo;. Enter a feed ID manually below.
                </p>
              )}

              {/* Selected feed display */}
              {feedId && selectedFeedName && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 p-2">
                  <span className="text-sm font-medium text-blue-800">{selectedFeedName}</span>
                  <button
                    type="button"
                    onClick={() => { setFeedId(""); setSelectedFeedName(null); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Change
                  </button>
                </div>
              )}

              <input
                type="text"
                value={feedId}
                onChange={(e) => { setFeedId(e.target.value.trim()); setSelectedFeedName(null); }}
                placeholder="e.g. ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
                className={`mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs ${
                  feedId && !feedValid ? "border-red-300 bg-red-50" : "border-gray-200"
                } focus:border-gray-900 focus:outline-none`}
              />
              {feedId && !feedValid && (
                <p className="mt-1 text-xs text-red-500">Must be exactly 64 hex characters</p>
              )}
              <a
                href="https://pyth.network/developers/price-feed-ids"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-blue-600 hover:underline"
              >
                Browse all Pyth feed IDs
              </a>
            </div>
          )}

          {/* DEX Pool Selection */}
          {oracleMode === "dex" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                DEX Pool Address
              </label>
              <FieldHint>
                Uses an on-chain DEX pool as the price oracle. Works with any token that has a trading
                pool on PumpSwap, Raydium, or Meteora. Fully permissionless — no external oracle operator needed.
              </FieldHint>

              {/* Auto-discovered pools */}
              {dexPools.length > 0 && !dexPoolAddress && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-500">Discovered pools (by liquidity):</p>
                  {dexPools.map((pool) => (
                    <button
                      key={pool.poolAddress}
                      type="button"
                      onClick={() => {
                        setDexPoolAddress(pool.poolAddress);
                        setSelectedDexPool(pool);
                      }}
                      className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50"
                    >
                      <div>
                        <span className="font-medium text-gray-900">{pool.pairLabel}</span>
                        <span className="ml-2 text-xs text-gray-400 capitalize">{pool.dexId}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-gray-500">${pool.liquidityUsd.toLocaleString()} liq</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {dexPoolsLoading && <p className="mt-1 text-xs text-gray-400">Searching DEX pools...</p>}
              {!dexPoolsLoading && dexPools.length === 0 && mintValid && (
                <p className="mt-1 text-xs text-gray-400">
                  No supported DEX pools found. Enter a pool address manually.
                </p>
              )}

              {/* Selected pool info */}
              {dexPoolAddress && selectedDexPool && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 p-2">
                  <div>
                    <span className="text-sm font-medium text-blue-800">
                      {selectedDexPool.pairLabel}
                    </span>
                    <span className="ml-2 text-xs text-blue-600 capitalize">
                      {selectedDexPool.dexId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDexPoolAddress(""); setSelectedDexPool(null); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Change
                  </button>
                </div>
              )}

              <input
                type="text"
                value={dexPoolAddress}
                onChange={(e) => { setDexPoolAddress(e.target.value.trim()); setSelectedDexPool(null); }}
                placeholder="Pool address (base58)"
                className={`mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs ${
                  dexPoolAddress && !dexPoolValid ? "border-red-300 bg-red-50" : "border-gray-200"
                } focus:border-gray-900 focus:outline-none`}
              />
              {dexPoolAddress && !dexPoolValid && (
                <p className="mt-1 text-xs text-red-500">Invalid base58 public key</p>
              )}
            </div>
          )}

          {/* Invert */}
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={invert}
                onChange={(e) => setInvert(e.target.checked)}
                className="rounded border-gray-300"
              />
              Invert price feed
            </label>
            <FieldHint>Enable if the collateral IS the asset being priced (e.g. SOL-denominated SOL/USD market).</FieldHint>
          </div>
        </div>
      </StepSection>

      {/* Step 2: Risk Parameters */}
      <StepSection
        open={openStep === 2}
        onToggle={() => setOpenStep(openStep === 2 ? 0 : 2)}
        title="Risk Parameters"
        stepNum={2}
        valid={step2Valid}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Trading Fee: {tradingFeeBps} bps ({(tradingFeeBps / 100).toFixed(2)}%)
            </label>
            <FieldHint>Fee charged on every trade. 30 bps (0.30%) is standard for most perp exchanges.</FieldHint>
            <input
              type="range"
              min={1}
              max={100}
              value={tradingFeeBps}
              onChange={(e) => setTradingFeeBps(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Initial Margin: {initialMarginBps} bps ({(initialMarginBps / 100).toFixed(1)}%)
            </label>
            <FieldHint>Minimum collateral to open a position as % of notional. {initialMarginBps} bps = {(initialMarginBps / 100).toFixed(0)}% = {maxLeverage}x max leverage.</FieldHint>
            <input
              type="range"
              min={100}
              max={5000}
              step={100}
              value={initialMarginBps}
              onChange={(e) => setInitialMarginBps(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-3">
            <div>
              <p className="text-xs text-gray-500">Maintenance Margin</p>
              <p className="text-sm font-medium text-gray-900">
                {(maintenanceMarginBps / 100).toFixed(1)}%
              </p>
              <p className="text-xs text-gray-400">Positions below this are liquidated</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Max Leverage</p>
              <p className="text-sm font-medium text-gray-900">{maxLeverage}x</p>
            </div>
          </div>
        </div>
      </StepSection>

      {/* Step 3: Liquidity Setup */}
      <StepSection
        open={openStep === 3}
        onToggle={() => setOpenStep(openStep === 3 ? 0 : 3)}
        title="Liquidity Setup"
        stepNum={3}
        valid={step3Valid}
      >
        <div className="space-y-4">
          {/* Balance display */}
          {tokenBalance !== null && tokenMeta && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Your balance</p>
              <p className="text-sm font-medium text-gray-900">
                {formatHumanAmount(tokenBalance, tokenMeta.decimals)} {tokenMeta.symbol}
              </p>
            </div>
          )}

          {balanceLoading && (
            <p className="text-xs text-gray-400">Loading balance...</p>
          )}

          {/* LP Collateral */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              LP Collateral{tokenMeta ? ` (${tokenMeta.symbol})` : ""}
            </label>
            <FieldHint>Initial liquidity backing the other side of every trade. More collateral = market handles larger positions.</FieldHint>
            <input
              type="text"
              value={lpCollateral}
              onChange={(e) => setLpCollateral(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="e.g. 1000.00"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          {/* Insurance Fund */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Insurance Fund{tokenMeta ? ` (${tokenMeta.symbol})` : ""}
            </label>
            <FieldHint>Safety buffer absorbing losses from liquidations. More insurance = healthier market.</FieldHint>
            <input
              type="text"
              value={insuranceAmount}
              onChange={(e) => setInsuranceAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="e.g. 500.00"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>

          {balanceWarning && (
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-sm text-amber-700">
                Combined amount exceeds 80% of your token balance.
              </p>
            </div>
          )}
        </div>
      </StepSection>

      {/* Step 4: Review & Create */}
      <StepSection
        open={openStep === 4}
        onToggle={() => setOpenStep(openStep === 4 ? 0 : 4)}
        title="Review & Create"
        stepNum={4}
        valid={false}
      >
        <div className="space-y-4">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 text-gray-500">Mint</td>
                <td className="py-2 text-right text-gray-900">
                  {tokenMeta ? (
                    <span>{tokenMeta.name} ({tokenMeta.symbol})</span>
                  ) : mintValid ? (
                    <span className="font-mono text-xs">{mint.slice(0, 12)}...</span>
                  ) : "—"}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-gray-500">Oracle</td>
                <td className="py-2 text-right text-gray-900">
                  {oracleMode === "dex"
                    ? selectedDexPool
                      ? `DEX — ${selectedDexPool.pairLabel} (${selectedDexPool.dexId})`
                      : `DEX — ${dexPoolAddress.slice(0, 12)}...`
                    : selectedFeedName
                      ? `Pyth — ${selectedFeedName}`
                      : `Pyth — ${feedId.slice(0, 12)}...`}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-gray-500">Inverted</td>
                <td className="py-2 text-right text-gray-900">{invert ? "Yes" : "No"}</td>
              </tr>
              <tr>
                <td className="py-2 text-gray-500">Trading Fee</td>
                <td className="py-2 text-right text-gray-900">{tradingFeeBps} bps ({(tradingFeeBps / 100).toFixed(2)}%)</td>
              </tr>
              <tr>
                <td className="py-2 text-gray-500">Initial Margin</td>
                <td className="py-2 text-right text-gray-900">{initialMarginBps} bps ({maxLeverage}x max)</td>
              </tr>
              <tr>
                <td className="py-2 text-gray-500">LP Collateral</td>
                <td className="py-2 text-right text-gray-900">
                  {lpCollateral ? `${lpCollateral} ${symbol}` : "—"}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-gray-500">Insurance Fund</td>
                <td className="py-2 text-right text-gray-900">
                  {insuranceAmount ? `${insuranceAmount} ${symbol}` : "—"}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Estimated SOL cost</p>
            <p className="text-sm font-medium text-gray-900">~6.9 SOL (slab rent + tx fees)</p>
          </div>

          {!publicKey && (
            <p className="text-sm text-amber-600">Connect your wallet to create a market.</p>
          )}

          <button
            onClick={handleCreate}
            disabled={!allValid || !publicKey}
            className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Create Market
          </button>
        </div>
      </StepSection>
    </div>
  );
};
