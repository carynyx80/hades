import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Deploys Haze to the selected network and writes deployments/<chainId>.json.
 *
 * Env:
 *   DEPLOYER_PRIVATE_KEY   deployer (becomes admin)
 *   TOKEN                  stablecoin address; omitted on testnets → deploys a no-value TestUSD faucet token
 *   PYTH                   Pyth contract address; omitted → SignedPriceOracle signed by KEEPER_ADDRESS
 *   KEEPER_ADDRESS         price signer for SignedPriceOracle (default: deployer)
 *   FEED_BTC/ETH/BNB/SOL   Pyth feed ids (required with PYTH)
 *   SPEND_VERIFIER, CLAIM_VERIFIER  generated Noir verifiers (see circuits/README.md)
 *   ALLOW_MOCK_VERIFIER=1  testnet-only: deploy accept-all mock verifiers (NO PRIVACY OR SAFETY; demo only)
 *   LOCKED=1               placeholder deployment: deposits are impossible (minDeposit = 2^128 - 1), so the pool can
 *                          never hold funds. Allows mock verifiers and the signed oracle on mainnet. A locked
 *                          deployment can never be unlocked safely: real launches are a fresh deployment.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const isLocal = chainId === 31337n;
  // BNB Smart Chain (56) and Robinhood Chain (4663) mainnets: real funds.
  const isMainnet = chainId === 56n || chainId === 4663n;
  const locked = process.env.LOCKED === "1";
  if (locked) console.warn("LOCKED deployment: deposits disabled; this deployment can never hold funds.");
  console.log(`Deploying to ${network.name} (${chainId}) from ${deployer.address}`);

  let token = process.env.TOKEN;
  if (!token) {
    if (isMainnet) throw new Error("TOKEN is required on mainnet");
    const t = await ethers.deployContract("TestUSD");
    token = await t.getAddress();
    console.log("TestUSD", token);
  }

  let oracle: string;
  const feeds: Record<string, string> = {};
  const assets = ["BTC", "ETH", "BNB", "SOL"];
  if (process.env.PYTH) {
    const o = await ethers.deployContract("PythOracle", [process.env.PYTH, 30]);
    oracle = await o.getAddress();
    for (const a of assets) {
      const f = process.env[`FEED_${a}`];
      if (!f) throw new Error(`FEED_${a} is required with PYTH`);
      feeds[a] = f;
    }
  } else {
    if (isMainnet && !locked) throw new Error("PYTH is required on mainnet");
    const o = await ethers.deployContract("SignedPriceOracle", [deployer.address, process.env.KEEPER_ADDRESS || deployer.address]);
    oracle = await o.getAddress();
    for (const a of assets) feeds[a] = ethers.id(`${a}/USD`);
  }
  console.log("Oracle", oracle);

  let spendV = process.env.SPEND_VERIFIER;
  let claimV = process.env.CLAIM_VERIFIER;
  let mockVerifiers = false;
  if (!spendV || !claimV) {
    if (!isLocal && process.env.ALLOW_MOCK_VERIFIER !== "1") throw new Error("SPEND_VERIFIER and CLAIM_VERIFIER are required");
    if (isMainnet && !locked) throw new Error("mock verifiers are only allowed on mainnet in a LOCKED deployment");
    spendV = await (await ethers.deployContract("MockVerifier")).getAddress();
    claimV = await (await ethers.deployContract("MockVerifier")).getAddress();
    mockVerifiers = true;
    console.warn("WARNING: mock verifiers deployed. Proofs are not checked. Demo only.");
  }

  const poseidon = await ethers.deployContract("PoseidonT3");
  const rounds = await ethers.deployContract("HazeRounds", [deployer.address, oracle]);
  const Pool = await ethers.getContractFactory("HazePool", {
    libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidon.getAddress() },
  });
  const minDeposit = locked ? 2n ** 128n - 1n : BigInt(process.env.MIN_DEPOSIT || "1000000");
  const pool = await Pool.deploy(deployer.address, token, await rounds.getAddress(), spendV, claimV, minDeposit);
  await pool.waitForDeployment();
  await (await rounds.setPool(await pool.getAddress())).wait();
  for (const [i, a] of assets.entries()) await (await rounds.setFeed(i, feeds[a])).wait();

  const out = {
    chainId: Number(chainId),
    token,
    oracle,
    oracleKind: process.env.PYTH ? "pyth" : "signed",
    rounds: await rounds.getAddress(),
    pool: await pool.getAddress(),
    poseidon: await poseidon.getAddress(),
    spendVerifier: spendV,
    claimVerifier: claimV,
    mockVerifiers,
    locked,
    minDeposit: minDeposit.toString(),
    feeds,
    block: await ethers.provider.getBlockNumber(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${chainId}.json`), JSON.stringify(out, null, 2) + "\n");
  console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
