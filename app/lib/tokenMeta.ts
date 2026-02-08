import { Connection, PublicKey } from "@solana/web3.js";

export interface TokenMeta {
  decimals: number;
  symbol: string;
  name: string;
}

const cache = new Map<string, TokenMeta>();

/**
 * Fetch token metadata: decimals from on-chain mint, symbol/name from Jupiter.
 * Results are cached in-memory.
 */
export async function fetchTokenMeta(
  connection: Connection,
  mint: PublicKey,
): Promise<TokenMeta> {
  const key = mint.toBase58();
  const cached = cache.get(key);
  if (cached) return cached;

  // Get decimals from on-chain mint account
  const mintInfo = await connection.getParsedAccountInfo(mint);
  let decimals = 6;
  if (mintInfo.value?.data && "parsed" in mintInfo.value.data) {
    decimals = mintInfo.value.data.parsed.info.decimals ?? 6;
  }

  // Try Jupiter token list for symbol/name
  let symbol = key.slice(0, 4) + "...";
  let name = "Unknown Token";
  try {
    const resp = await fetch(`https://tokens.jup.ag/token/${key}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const json = (await resp.json()) as any;
      if (json.symbol) symbol = json.symbol;
      if (json.name) name = json.name;
    }
  } catch {
    // Use defaults
  }

  const meta: TokenMeta = { decimals, symbol, name };
  cache.set(key, meta);
  return meta;
}
