"use client";

import { useCallback, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  encodeInitUser,
  ACCOUNTS_INIT_USER,
  buildAccountMetas,
  WELL_KNOWN,
  buildIx,
  getAta,
} from "@percolator/core";
import { sendTx } from "@/lib/tx";
import { config } from "@/lib/config";
import { useSlabState } from "@/components/providers/SlabProvider";

export function useInitUser() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { config: mktConfig } = useSlabState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initUser = useCallback(
    async (feePayment: bigint = 1_000_000n) => {
      if (!wallet.publicKey || !mktConfig) {
        throw new Error("Wallet not connected or market not loaded");
      }

      setLoading(true);
      setError(null);

      try {
        const programId = new PublicKey(config.programId);
        const slabPk = new PublicKey(config.slabAddress);

        const userAta = await getAta(wallet.publicKey, mktConfig.collateralMint);

        const ixData = encodeInitUser({ feePayment: feePayment.toString() });

        const keys = buildAccountMetas(ACCOUNTS_INIT_USER, [
          wallet.publicKey,
          slabPk,
          userAta,
          mktConfig.vaultPubkey,
          WELL_KNOWN.tokenProgram,
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

  return { initUser, loading, error };
}
