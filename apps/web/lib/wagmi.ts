import { createConfig, http, injected } from "wagmi";
import { bsc } from "viem/chains";
import { defineChain } from "viem";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

export const wagmiConfig = createConfig({
  chains: [bsc, robinhood],
  // Browser-extension wallets (MetaMask, Rabby, Trust, OKX, Robinhood Wallet…) are discovered via EIP-6963.
  connectors: [injected({ shimDisconnect: true })],
  transports: { [bsc.id]: http(), [robinhood.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
