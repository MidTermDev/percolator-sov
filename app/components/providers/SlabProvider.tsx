"use client";

import {
  FC,
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  parseHeader,
  parseConfig,
  parseEngine,
  parseAllAccounts,
  parseParams,
  type SlabHeader,
  type MarketConfig,
  type EngineState,
  type RiskParams,
  type Account,
} from "@percolator/core";

export interface SlabState {
  raw: Buffer | null;
  header: SlabHeader | null;
  config: MarketConfig | null;
  engine: EngineState | null;
  params: RiskParams | null;
  accounts: { idx: number; account: Account }[];
  loading: boolean;
  error: string | null;
}

const defaultState: SlabState = {
  raw: null,
  header: null,
  config: null,
  engine: null,
  params: null,
  accounts: [],
  loading: true,
  error: null,
};

const SlabContext = createContext<SlabState>(defaultState);

export const useSlabState = () => useContext(SlabContext);

const SLAB_ADDRESS = process.env.NEXT_PUBLIC_SLAB_ADDRESS ?? "";
const POLL_INTERVAL_MS = 3000;

export const SlabProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { connection } = useConnection();
  const [state, setState] = useState<SlabState>(defaultState);
  const wsActive = useRef(false);

  useEffect(() => {
    if (!SLAB_ADDRESS) {
      setState((s) => ({ ...s, loading: false, error: "SLAB_ADDRESS not set" }));
      return;
    }

    const slabPk = new PublicKey(SLAB_ADDRESS);

    function parseSlab(data: Buffer) {
      try {
        const header = parseHeader(data);
        const config = parseConfig(data);
        const engine = parseEngine(data);
        const params = parseParams(data);
        const accounts = parseAllAccounts(data);
        setState({
          raw: data,
          header,
          config,
          engine,
          params,
          accounts,
          loading: false,
          error: null,
        });
      } catch (e) {
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    }

    // Try websocket subscription
    let subId: number | undefined;
    try {
      subId = connection.onAccountChange(slabPk, (info) => {
        wsActive.current = true;
        parseSlab(Buffer.from(info.data));
      });
    } catch {
      // websocket not available
    }

    // Polling fallback
    let timer: ReturnType<typeof setInterval> | undefined;
    async function poll() {
      if (wsActive.current) return;
      try {
        const info = await connection.getAccountInfo(slabPk);
        if (info) parseSlab(Buffer.from(info.data));
      } catch {
        // ignore poll errors
      }
    }

    // Initial fetch
    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (subId !== undefined) connection.removeAccountChangeListener(subId);
      if (timer) clearInterval(timer);
    };
  }, [connection]);

  return <SlabContext.Provider value={state}>{children}</SlabContext.Provider>;
};
