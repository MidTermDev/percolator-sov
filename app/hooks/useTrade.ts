"use client";

import { useCallback, useState } from "react";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  encodeTradeCpi,
  ACCOUNTS_TRADE_CPI,
  buildAccountMetas,
  buildIx,
  deriveLpPda,
} from "@percolator/core";
import { sendTx } from "@/lib/tx";
import { config } from "@/lib/config";
import { useSlabState } from "@/components/providers/SlabProvider";

export function useTrade() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { config: mktConfig } = useSlabState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trade = useCallback(
    async (params: { lpIdx: number; userIdx: number; size: bigint }) => {
      if (!wallet.publicKey || !mktConfig) {
        throw new Error("Wallet not connected or market not loaded");
      }

      setLoading(true);
      setError(null);

      try {
        const programId = new PublicKey(config.programId);
        const slabPk = new PublicKey(config.slabAddress);

        const ixData = encodeTradeCpi({
          lpIdx: params.lpIdx,
          userIdx: params.userIdx,
          size: params.size.toString(),
        });

        const [lpPda] = deriveLpPda(programId, slabPk, params.lpIdx);

        // For trade-cpi, lpOwner is the LP's owner — we pass system program as placeholder
        // since the matcher validates via CPI
        const keys = buildAccountMetas(ACCOUNTS_TRADE_CPI, [
          wallet.publicKey,
          PublicKey.default, // lpOwner - resolved by matcher
          slabPk,
          new PublicKey("SysvarC1ock11111111111111111111111111111111"),
          mktConfig.indexFeedId, // oracle
          new PublicKey("11111111111111111111111111111111"), // matcherProg placeholder
          new PublicKey("11111111111111111111111111111111"), // matcherCtx placeholder
          lpPda,
        ]);

        const ix = buildIx({ programId, keys, data: ixData });
        const sig = await sendTx({ connection, wallet, instruction: ix });
        return sig;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [connection, wallet, mktConfig]
  );

  return { trade, loading, error };
}
