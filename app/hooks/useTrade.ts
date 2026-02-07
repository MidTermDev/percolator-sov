"use client";

import { useCallback, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  encodeTradeCpi,
  ACCOUNTS_TRADE_CPI,
  buildAccountMetas,
  buildIx,
  deriveLpPda,
  WELL_KNOWN,
} from "@percolator/core";
import { sendTx } from "@/lib/tx";
import { config } from "@/lib/config";
import { useSlabState } from "@/components/providers/SlabProvider";

export function useTrade() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { config: mktConfig, accounts } = useSlabState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trade = useCallback(
    async (params: { lpIdx: number; userIdx: number; size: bigint }) => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet.publicKey || !mktConfig) {
          throw new Error("Wallet not connected or market not loaded");
        }

        // Find the LP account from slab to get matcher addresses
        const lpAccount = accounts.find((a) => a.idx === params.lpIdx);
        if (!lpAccount) {
          throw new Error(`LP account at index ${params.lpIdx} not found`);
        }

        const programId = new PublicKey(config.programId);
        const slabPk = new PublicKey(config.slabAddress);

        const ixData = encodeTradeCpi({
          lpIdx: params.lpIdx,
          userIdx: params.userIdx,
          size: params.size.toString(),
        });

        const [lpPda] = deriveLpPda(programId, slabPk, params.lpIdx);

        const keys = buildAccountMetas(ACCOUNTS_TRADE_CPI, [
          wallet.publicKey,
          lpAccount.account.owner,        // LP owner from slab data
          slabPk,
          WELL_KNOWN.clock,
          slabPk,                          // oracle = slab for admin oracle / hyperp mode
          lpAccount.account.matcherProgram,
          lpAccount.account.matcherContext,
          lpPda,
        ]);

        const ix = buildIx({ programId, keys, data: ixData });
        const sig = await sendTx({ connection, wallet, instruction: ix, computeUnits: 400_000 });
        return sig;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [connection, wallet, mktConfig, accounts]
  );

  return { trade, loading, error };
}
