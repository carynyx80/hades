export const ASSETS = ["BTC", "ETH", "BNB", "SOL"] as const;
export type Asset = (typeof ASSETS)[number];

export const TIMEFRAMES = [
  { id: "5m", seconds: 300, cutoff: 60 },
  { id: "10m", seconds: 600, cutoff: 120 },
  { id: "15m", seconds: 900, cutoff: 120 },
  { id: "1h", seconds: 3600, cutoff: 300 },
  { id: "1d", seconds: 86400, cutoff: 3600 },
] as const;

export const REVEAL_GRACE = 300;

export type Deployment = {
  chainId: number;
  token: string;
  oracle: string;
  oracleKind: "pyth" | "signed";
  rounds: string;
  pool: string;
  mockVerifiers: boolean;
  feeds: Record<Asset, string>;
  block: number;
};

export type ChainConfig = { chainId: number; name: string; rpc: string; deployment?: Deployment };

/** Deployments come from env as JSON (DEPLOYMENT_97, DEPLOYMENT_46630), copied from contracts/deployments/<id>.json. */
export function chains(): ChainConfig[] {
  const list = [
    { chainId: 97, name: "BNB Chain testnet", rpc: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.bnbchain.org:8545" },
    { chainId: 46630, name: "Robinhood Chain testnet", rpc: process.env.ROBINHOOD_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com" },
  ];
  return list.map((c) => {
    const raw = process.env[`DEPLOYMENT_${c.chainId}`];
    return { ...c, deployment: raw ? (JSON.parse(raw) as Deployment) : undefined };
  });
}

export const env = {
  port: Number(process.env.PORT || 8787),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  keeperKey: process.env.KEEPER_PRIVATE_KEY,
  relayerKey: process.env.RELAYER_PRIVATE_KEY,
  hermes: process.env.HERMES_URL || "https://hermes.pyth.network",
};
