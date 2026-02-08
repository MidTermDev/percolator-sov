import { Connection, Transaction, TransactionInstruction, ComputeBudgetProgram } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import type { Signer } from "@solana/web3.js";

export interface SendTxParams {
  connection: Connection;
  wallet: WalletContextState;
  instructions: TransactionInstruction[];
  computeUnits?: number;
  signers?: Signer[];
}

export async function sendTx({
  connection,
  wallet,
  instructions,
  computeUnits = 200_000,
  signers = [],
}: SendTxParams): Promise<string> {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error("Wallet not connected");
  }

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));
  for (const ix of instructions) {
    tx.add(ix);
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  const signature = await wallet.sendTransaction(tx, connection, {
    signers: signers.length > 0 ? signers : undefined,
  });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}
