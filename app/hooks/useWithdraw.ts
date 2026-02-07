"use client";

import { useCallback, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  encodeWithdrawCollateral,
  ACCOUNTS_WITHDRAW_COLLATERAL,
  buildAccountMetas,
  WELL_KNOWN,
  buildIx,
  getAta,
  deriveVaultAuthority,
} from "@percolator/core";
import { sendTx } from "@/lib/tx";
import { config } from "@/lib/config";
import { useSlabState } from "@/components/providers/SlabProvider";

export function useWithdraw() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { config: mktConfig } = useSlabState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
    async (params: { userIdx: number; amount: bigint }) => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet.publicKey || !mktConfig) {
          throw new Error("Wallet not connected or market not loaded");
        }
        const programId = new PublicKey(config.programId);
        const slabPk = new PublicKey(config.slabAddress);

        const userAta = await getAta(wallet.publicKey, mktConfig.collateralMint);
        const [vaultPda] = deriveVaultAuthority(programId, slabPk);

        const ixData = encodeWithdrawCollateral({
          userIdx: params.userIdx,
          amount: params.amount.toString(),
        });

        const keys = buildAccountMetas(ACCOUNTS_WITHDRAW_COLLATERAL, [
          wallet.publicKey,
          slabPk,
          mktConfig.vaultPubkey,
          userAta,
          vaultPda,
          WELL_KNOWN.tokenProgram,
          WELL_KNOWN.clock,
          slabPk, // oracle: slab itself in Hyperp/admin oracle mode
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

  return { withdraw, loading, error };
}
