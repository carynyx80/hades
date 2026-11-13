import http from "node:http";
import { ethers } from "ethers";
import { ASSETS, TIMEFRAMES, chains, env, type Asset } from "./config.js";
import { discoverFeeds, history, latest, poll, priceAt, pricesHealthy } from "./prices.js";
import { ChainService } from "./chain.js";
import { accountView, authAddress, faucet, loadPlay, save as savePlay, marketsView, newNonce, placeBet, signInMessage, verifySignIn } from "./play.js";

const services = chains().map((c) => new ChainService(c));
const byId = new Map(services.map((s) => [s.cfg.chainId, s]));
const started = Date.now();

// Simple per-IP rate limit for POST endpoints.
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string, max = 30) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) { hits.set(ip, { n: 1, t: now }); return false; }
  return ++h.n > max;
}

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": env.corsOrigin,
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let s = "";
  for await (const c of req) { s += c; if (s.length > 200_000) throw new Error("body too large"); }
  return JSON.parse(s || "{}");
}

async function rounds(chainId?: number) {
  const now = Math.floor(Date.now() / 1000);
  const svc = chainId ? byId.get(chainId) : undefined;
  const out = [];
  for (const [ai, a] of ASSETS.entries()) {
    for (const tf of TIMEFRAMES) {
      const id = Math.floor(now / tf.seconds);
      const start = id * tf.seconds;
      const end = start + tf.seconds;
      const lockAt = end - tf.cutoff;
      out.push({
        asset: a,
        timeframe: tf.id,
        roundId: id,
        start,
        lockAt,
        end,
        open: now < lockAt,
        startPrice: await priceAt(a, start),
        price: latest[a]?.price ?? null,
        totals: svc?.live ? await svc.roundTotals(ai, tf.seconds, BigInt(id)).catch(() => null) : null,
      });
    }
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "?";
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method === "GET") {
      switch (url.pathname) {
        case "/":
          return send(res, 200, {
            name: "primar-api",
            endpoints: ["/health", "/prices", "/rounds", "/chains", "/play/markets", "/play/account", "GET /auth/nonce?address=", "POST /auth/verify", "POST /play/bet", "POST /play/faucet", "POST /reveal", "POST /relay"],
          });
        case "/auth/nonce": {
          const address = url.searchParams.get("address") || "";
          if (!ethers.isAddress(address)) return send(res, 400, { error: "bad address" });
          const nonce = newNonce();
          return send(res, 200, { nonce, message: signInMessage(ethers.getAddress(address), nonce) });
        }
        case "/play/markets":
          return send(res, 200, marketsView());
        case "/play/account": {
          const addr = authAddress(req.headers.authorization);
          if (!addr) return send(res, 401, { error: "sign in" });
          return send(res, 200, accountView(addr));
        }
        case "/health": {
          const ok = pricesHealthy();
          return send(res, ok ? 200 : 503, { ok, uptime: Math.round((Date.now() - started) / 1000), chains: services.map((s) => s.status()) });
        }
        case "/prices":
          return send(res, 200, Object.fromEntries(ASSETS.map((a) => [a, { ...latest[a], history: history[a].slice(-120) }])));
        case "/rounds":
          return send(res, 200, await rounds(Number(url.searchParams.get("chainId")) || undefined));
        case "/chains":
          return send(res, 200, services.map((s) => s.status()));
      }
      return send(res, 404, { error: "not found" });
    }
    if (req.method === "POST") {
      if (limited(ip, 120)) return send(res, 429, { error: "slow down" });
      const body = await readJson(req);
      if (url.pathname === "/auth/verify") {
        try {
          return send(res, 200, verifySignIn(String(body.address), String(body.nonce), String(body.signature)));
        } catch (e) {
          return send(res, 401, { error: (e as Error).message });
        }
      }
      if (url.pathname.startsWith("/play/")) {
        const addr = authAddress(req.headers.authorization);
        if (!addr) return send(res, 401, { error: "sign in" });
        try {
          if (url.pathname === "/play/bet") return send(res, 200, placeBet(addr, body.asset, body.timeframe, body.side, Number(body.amount)));
          if (url.pathname === "/play/faucet") return send(res, 200, faucet(addr));
        } catch (e) {
          return send(res, 400, { error: (e as Error).message });
        }
        return send(res, 404, { error: "not found" });
      }
      const svc = byId.get(Number(body.chainId));
      if (!svc?.live) return send(res, 400, { error: "chain not deployed" });
      if (url.pathname === "/reveal") {
        const side = Number(body.side);
        if (![1, 2].includes(side) || !ethers.isHexString(body.salt, 32)) return send(res, 400, { error: "bad reveal" });
        svc.queueReveal(BigInt(body.betId), side, body.salt, Number(body.tf), BigInt(body.roundId));
        return send(res, 202, { queued: true });
      }
      if (url.pathname === "/relay") {
        if (!["bet", "withdraw", "claim"].includes(body.method) || !Array.isArray(body.args)) return send(res, 400, { error: "bad relay request" });
        const hash = await svc.relay(body.method, body.args);
        return send(res, 202, { hash });
      }
      return send(res, 404, { error: "not found" });
    }
    send(res, 405, { error: "method not allowed" });
  } catch (e) {
    send(res, 500, { error: (e as Error).message.slice(0, 300) });
  }
});

async function main() {
  await discoverFeeds();
  await poll();
  loadPlay();
  setInterval(poll, 2000);
  setInterval(() => discoverFeeds(), 5 * 60_000);
  const keeperLoop = async () => {
    for (const s of services) await s.tick();
    setTimeout(keeperLoop, 15_000);
  };
  keeperLoop();
  server.listen(env.port, () => {
    console.log(`primar-api on :${env.port}`);
    for (const s of services) console.log(" ", JSON.stringify(s.status()));
  });
}
main();

// Railway sends SIGTERM when replacing a deployment: save play state and exit cleanly.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`${sig} received, saving and shutting down`);
    savePlay();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
process.on("unhandledRejection", (e) => console.error("unhandled rejection", e));
