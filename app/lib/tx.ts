import { Connection, Transaction, TransactionInstruction, ComputeBudgetProgram } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export interface SendTxParams {
  connection: Connection;
  wallet: WalletContextState;
  instruction: TransactionInstruction;
  computeUnits?: number;
}

export async function sendTx({
  connection,
  wallet,
  instruction,
  computeUnits = 200_000,
}: SendTxParams): Promise<string> {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error("Wallet not connected");
  }

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }));
  tx.add(instruction);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  const signature = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}
