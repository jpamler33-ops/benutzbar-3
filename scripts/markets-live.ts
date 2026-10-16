import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { Store } from "../server/db.ts";
import { MarketMonitor, marketOverview } from "../server/markets.ts";
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  setGlobalDispatcher(new EnvHttpProxyAgent());
const store = new Store(
  process.env.DATABASE_PATH ?? "data/markets-live.sqlite",
);
try {
  const results = await new MarketMonitor(store).refresh();
  console.log(
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        results,
        markets: marketOverview(store)
          .filter((m) =>
            [
              "btc-eur",
              "eth-eur",
              "eur-usd",
              "products",
              "industries",
              "stock-IBM",
            ].includes(m.id),
          )
          .map((m) => ({
            id: m.id,
            source: m.source,
            state: m.state,
            points: m.trend.points.length,
            asOf: m.trend.asOf,
            signal: m.trend.state,
            percent: m.trend.percent,
            error: m.error,
          })),
      },
      null,
      2,
    ),
  );
  if (results.some((r) => !r.ok)) process.exitCode = 1;
} finally {
  store.close();
}
