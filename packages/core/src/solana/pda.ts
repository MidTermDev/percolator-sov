import { PublicKey } from "@solana/web3.js";

const textEncoder = new TextEncoder();

/**
 * Derive vault authority PDA.
 * Seeds: ["vault", slab_key]
 */
export function deriveVaultAuthority(
  programId: PublicKey,
  slab: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("vault"), slab.toBytes()],
    programId
  );
}

/**
 * Derive LP PDA for TradeCpi.
 * Seeds: ["lp", slab_key, lp_idx as u16 LE]
 */
export function deriveLpPda(
  programId: PublicKey,
  slab: PublicKey,
  lpIdx: number
): [PublicKey, number] {
  const idxBuf = new Uint8Array(2);
  new DataView(idxBuf.buffer).setUint16(0, lpIdx, true);
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("lp"), slab.toBytes(), idxBuf],
    programId
  );
}
