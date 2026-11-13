# Mainnet deployment

## Locked placeholder (now)

A **locked** deployment puts the contracts on BNB Smart Chain (56) and Robinhood Chain (4663) with deposits
permanently disabled (`minDeposit = 2^128 - 1`, `deposit` reverts with `PoolLocked`, and `setMinDeposit` cannot change
it). It uses placeholder verifiers that accept any proof, which is only safe because the pool can never receive a
deposit. **Never send tokens to a locked pool directly**: anything sent there can be taken by anyone.

A locked deployment cannot be upgraded or unlocked. The real launch is a fresh deployment with compiled Noir verifiers,
Pyth, an audited build and a multisig admin.

From the repository root, on your own machine (the private key never leaves it):

```bash
npm install
```

BNB Smart Chain (token: Binance-Peg BSC-USD):

```bash
cd contracts && DEPLOYER_PRIVATE_KEY=0x... LOCKED=1 TOKEN=0x55d398326f99059fF775485246999027B3197955 npx hardhat run scripts/deploy.ts --network bsc
```

Robinhood Chain (token: Paxos USDG):

```bash
cd contracts && DEPLOYER_PRIVATE_KEY=0x... LOCKED=1 TOKEN=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 npx hardhat run scripts/deploy.ts --network robinhood
```

Each run writes `contracts/deployments/<chainId>.json`; commit both files. Use a fresh deployer wallet holding only gas.

## Real launch (later)

1. Compile `circuits/spend` and `circuits/claim` and generate verifiers (see `circuits/README.md`).
2. End-to-end test with real proofs; testnet launch.
3. External audit.
4. Deploy without `LOCKED`, with `SPEND_VERIFIER`, `CLAIM_VERIFIER`, `PYTH`, `FEED_*`, `TOKEN`, then move admin roles to a
   multisig and start with a low deposit cap.
