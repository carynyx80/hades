# Haze

**Call the move. Stay unseen.**

Private Up/Down prediction markets on BTC, ETH, BNB and SOL, on BNB Chain and Robinhood Chain.
Rounds run every 5 min, 10 min, 15 min, 1 hour and 1 day, aligned to the clock.

## Status

| Part | State |
|---|---|
| `apps/web` landing site | Built (Next.js, Tailwind, Framer Motion) |
| `apps/web` trading app (`/app`) | Built in **demo mode**: live Pyth prices when reachable, simulated balance/bets |
| Contracts (rounds, shielded pool) | Next |
| ZK circuits (Noir) | Next |
| Keeper / relayer | Next |

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 (landing) and http://localhost:3000/app (trading).
