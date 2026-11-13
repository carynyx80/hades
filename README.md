# Primar

**Call the move. Stay unseen.**

Private Up/Down prediction markets on BTC, ETH, BNB and SOL, on BNB Chain and Robinhood Chain.
Rounds run every 5 min, 10 min, 15 min, 1 hour and 1 day, aligned to the clock.

## Status

| Part | State |
|---|---|
| `apps/web`: landing site and `/app` | Live on Vercel: https://haze-lake.vercel.app. `/app` runs in **demo mode** (simulated balance and bets) until contracts are deployed |
| `apps/api`: prices, rounds, keeper, relayer | Live on Railway: https://haze-api-production.up.railway.app. Keeper and relayer stay idle until `DEPLOYMENT_*` and keys are set |
| `contracts`: `PrimarRounds`, `PrimarPool`, oracles | Written and tested (`npm test -w @primar/contracts`, 10 passing). Not deployed |
| `circuits`: Noir `spend` and `claim` | Written, **not compiled yet** (needs nargo and bb; see `circuits/README.md`) |

Privacy model: bets come from a shielded pool via a relayer, so they are not linked to a wallet. Sides are sealed
until betting locks. Stake amounts are public. Pyth Hermes now needs an API key (`HERMES_API_KEY`) for settlement;
display prices fall back to Kraken, Coinbase and CoinGecko.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 (landing) and http://localhost:3000/app (trading).

```bash
npm test -w @primar/contracts
```

```bash
npm run start -w @primar/api
```
