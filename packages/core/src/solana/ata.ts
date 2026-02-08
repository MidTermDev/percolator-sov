import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, Account, TOKEN_PROGRAM_ID } from "@solana/spl-token";

/**
 * Get the associated token address for an owner and mint.
 * Optionally accepts a token program ID (defaults to SPL Token).
 */
export async function getAta(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId?: PublicKey,
): Promise<PublicKey> {
  return getAssociatedTokenAddress(
    mint,
    owner,
    false,
    tokenProgramId ?? TOKEN_PROGRAM_ID,
  );
}

/**
 * Fetch token account info.
 * Throws if account doesn't exist.
 */
export async function fetchTokenAccount(
  connection: Connection,
  address: PublicKey
): Promise<Account> {
  return getAccount(connection, address);
}
