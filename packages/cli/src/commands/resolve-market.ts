import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import {
  encodeResolveMarket,
  ACCOUNTS_RESOLVE_MARKET,
  buildAccountMetas,
  buildIx,
  simulateOrSend,
  formatResult,
  validatePublicKey,
} from "@percolator/core";

export function registerResolveMarket(program: Command): void {
  program
    .command("resolve-market")
    .description("Resolve binary market (admin only, requires oracle price to be set)")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");

      const ixData = encodeResolveMarket();
      const keys = buildAccountMetas(ACCOUNTS_RESOLVE_MARKET, [
        ctx.payer.publicKey,
        slabPk,
      ]);

      const ix = buildIx({
        programId: ctx.programId,
        keys,
        data: ixData,
      });

      const result = await simulateOrSend({
        connection: ctx.connection,
        ix,
        signers: [ctx.payer],
        simulate: flags.simulate ?? false,
        commitment: ctx.commitment,
      });

      console.log(formatResult(result, flags.json ?? false));
    });
}
