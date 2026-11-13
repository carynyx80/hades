import { subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import type { HardhatUserConfig } from "hardhat/config";
import path from "path";

const SOLC = "0.8.28";

// Use the compiler bundled in the `solc` npm package instead of downloading one.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion === SOLC) {
    const compilerPath = path.join(require.resolve("solc/package.json"), "..", "soljson.js");
    return { compilerPath, isSolcJs: true, version: SOLC, longVersion: require("solc/package.json").version };
  }
  return runSuper();
});

const key = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = key ? [key] : [];

const config: HardhatUserConfig = {
  paths: { sources: "src", tests: "test" },
  solidity: {
    compilers: [{ version: SOLC, settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun" } }],
    // The Poseidon library is generated assembly; the IR pipeline bloats it past the 24 KB limit.
    overrides: {
      "poseidon-solidity/PoseidonT3.sol": { version: SOLC, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
    },
  },
  networks: {
    bscTestnet: { url: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.bnbchain.org:8545", chainId: 97, accounts },
    bsc: { url: process.env.BSC_RPC || "https://bsc-dataseed.bnbchain.org", chainId: 56, accounts },
    robinhoodTestnet: { url: process.env.ROBINHOOD_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com", chainId: 46630, accounts },
  },
};
export default config;
