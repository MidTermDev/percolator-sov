export const config = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  programId: process.env.NEXT_PUBLIC_PROGRAM_ID ?? "",
  slabAddress: process.env.NEXT_PUBLIC_SLAB_ADDRESS ?? "",
  percMint: process.env.NEXT_PUBLIC_PERC_MINT ?? "A16Gd8AfaPnG6rohE6iPFDf6mr9gk519d6aMUJAperc",
} as const;
