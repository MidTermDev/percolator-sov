import { Connection } from "@solana/web3.js";
import { config } from "./config";

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(config.rpcUrl, "confirmed");
  }
  return _connection;
}
