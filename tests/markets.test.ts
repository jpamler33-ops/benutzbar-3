import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { Store } from "../server/db.ts";
import { Scanner } from "../server/scanner.ts";
import { createApp } from "../server/api.ts";
import { parseNotice } from "../server/ted.ts";
import {
  priceTrend,
  countTrend,
  parseCandles,
  parseEcb,
  parseAlpha,
  MarketMonitor,
  marketOverview,
  captureCoverage,
  type Point,
} from "../server/markets.ts";
const now = new Date("2026-10-16T10:00:00Z");
const points: Point[] = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-10-${String(i + 2).padStart(2, "0")}`,
  value: i < 7 ? 100 : 120,
}));
const noWait = async () => {};
const token = "market-test-key-at-least-24-characters";
test("Trend measures equal rolling windows, not current day or future; handles flat, zero and stale values", () => {
  const t = priceTrend(
    [
      ...points,
      { date: "2026-10-16", value: 9000 },
      { date: "2026-11-10", value: 99999 },
    ],
    now,
  );
  assert.equal(t.state, "STEIGT");
  assert.ok(Math.abs(t.percent! - 20) < 1e-8);
  assert.equal(t.current, 120);
  assert.equal(t.previous, 100);
  assert.equal(t.points.length, 14);
  assert.match(t.explanation, /nicht seine wirtschaftliche Ursache/);
  assert.equal(
    priceTrend(points, new Date("2026-11-01")).state,
    "ZU WENIG DATEN",
  );
  assert.equal(
    priceTrend(
      points.map((p) => ({ ...p, value: 100 })),
      now,
    ).state,
    "STABIL",
  );
  assert.equal(
    priceTrend(
      points.map((p) => ({ ...p, value: 0 })),
      now,
    ).percent,
    null,
  );
  assert.equal(priceTrend(points.slice(3), now).state, "ZU WENIG DATEN");
  assert.equal(
    priceTrend(
      points.map((p, i) => ({ ...p, value: i < 7 ? 120 : 100 })),
      now,
    ).state,
    "FÄLLT",
  );
});
test("Weekday series allow weekends; sparse observations cannot masquerade as a week", () => {
  const weekdays = points.filter(
    (p) => ![0, 6].includes(new Date(p.date).getUTCDay()),
  );
  assert.equal(priceTrend(weekdays, now, true).state, "STEIGT");
  assert.equal(priceTrend(weekdays, now).state, "ZU WENIG DATEN");
});
test("Publication comparison needs complete coverage, sample size and nonzero denominator", () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({
    published: i < 5 ? "2026-09-01" : "2026-10-01",
    category: "A",
    regional: true,
  }));
  const t = countTrend(rows, "A", "2026-08-01", "2026-10-15");
  assert.equal(t.state, "STEIGT");
  assert.equal(t.percent, 100);
  assert.equal(t.points.length, 56);
  assert.equal(
    countTrend(rows, "A", "2026-10-01", "2026-10-15").state,
    "ZU WENIG DATEN",
  );
  assert.equal(
    countTrend(rows.slice(0, 2), "A", "2026-08-01", "2026-10-15").state,
    "ZU WENIG DATEN",
  );
  assert.equal(
    countTrend(
      rows.filter((r) => r.published === "2026-10-01"),
      "A",
      "2026-08-01",
      "2026-10-15",
    ).percent,
    null,
  );
});
test("Coinbase parsing uses close, sorts dates, rejects bad shapes and incomplete current candle", () => {
  const a = Date.parse("2026-10-15") / 1000,
    b = Date.parse("2026-10-16") / 1000;
  assert.deepEqual(
    parseCandles(
      [
        [b, 1, 5, 2, 4, 1],
        [a, 1, 5, 2, 3, 4],
      ],
      now,
    ),
    [{ date: "2026-10-15", value: 3 }],
  );
  assert.throws(() => parseCandles({ message: "limit" }));
  assert.throws(() => parseCandles([[a, -2, 5, 2, 3, 4]], now));
});
test("ECB and Alpha Vantage parsers preserve units and reject errors", () => {
  assert.deepEqual(
    parseEcb(
      `<gesmes:name>European Central Bank</gesmes:name><Cube time="2026-10-15"><Cube currency="USD" rate="1.1208"/><Cube currency="GBP" rate="0.8461"/></Cube>`,
    ),
    [{ date: "2026-10-15", value: 1.1208 }],
  );
  assert.throws(() => parseEcb("<html>error</html>"));
  assert.deepEqual(
    parseAlpha({
      "Time Series (Daily)": { "2026-10-15": { "4. close": "123.45" } },
    }),
    [{ date: "2026-10-15", value: 123.45 }],
  );
  assert.throws(
    () => parseAlpha({ Information: "API call frequency exceeded" }),
    /keine Tageszeitreihe/,
  );
});
test("Persistent points upsert without duplicates, revisions leave history and failures retain data", async () => {
  const dir = mkdtempSync(join(tmpdir(), "os-market-"));
  try {
    let s = new Store(join(dir, "db"));
    let monitor = new MarketMonitor(s);
    monitor.save("btc-eur", points);
    monitor.save("btc-eur", points);
    assert.equal(
      (
        s.db
          .prepare(
            "SELECT COUNT(*) as n FROM MarketPoints WHERE seriesId='btc-eur'",
          )
          .get() as { n: number }
      ).n,
      14,
    );
    monitor.save("btc-eur", [{ ...points[0], value: 101 }]);
    assert.equal(
      (
        s.db.prepare("SELECT COUNT(*) as n FROM MarketPointUpdates").get() as {
          n: number;
        }
      ).n,
      1,
    );
    s.close();
    s = new Store(join(dir, "db"));
    assert.equal(
      (
        s.db.prepare("SELECT COUNT(*) as n FROM MarketPoints").get() as {
          n: number;
        }
      ).n,
      14,
    );
    monitor = new MarketMonitor(
      s,
      (async () =>
        new Response("unavailable", { status: 503 })) as typeof fetch,
      noWait,
    );
    const result = await monitor.refresh();
    assert.ok(result.every((r) => !r.ok));
    const btc = marketOverview(s, now).find((m) => m.id === "btc-eur")!;
    assert.equal(btc.state, "FEHLER");
    assert.ok(btc.lastSuccess);
    assert.equal(btc.trend.points.length, 14);
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Market retries respect source limits and database lock blocks overlapping refreshes", async () => {
  const s = new Store(":memory:");
  let calls = 0;
  const delays: number[] = [];
  const monitor = new MarketMonitor(
    s,
    (async () => {
      calls++;
      return calls === 1
        ? new Response("", { status: 429, headers: { "retry-after": "2" } })
        : new Response("ok");
    }) as typeof fetch,
    async (ms) => {
      delays.push(ms);
    },
  );
  assert.equal(await monitor.download("https://example.org"), "ok");
  assert.deepEqual(delays, [2000]);
  s.db
    .prepare("UPDATE MarketLock SET owner=?,expiresAt=? WHERE id=1")
    .run("other", "2099-01-01");
  await assert.rejects(monitor.refresh(), /bereits/);
  s.close();
});
test("Coverage contains only members from the successful scan, excludes test data and ignores failure", () => {
  const s = new Store(":memory:");
  const raw = JSON.parse(
    readFileSync(new URL("./fixtures/ted-live.json", import.meta.url), "utf8"),
  ).notices[1];
  const n = parseNotice(raw);
  s.upsert({ ...n, sourceId: "999020-2026", title: "Old unrelated entry" });
  const scanId = Number(
    s.db
      .prepare(
        "INSERT INTO ScanRuns(source,startedAt,finishedAt,state,query) VALUES('ted',?,?,'SUCCESS','publication-date >= 20260717')",
      )
      .run(now.toISOString(), now.toISOString()).lastInsertRowid,
  );
  captureCoverage(s, scanId, [
    n,
    n,
    { ...n, sourceId: "999021-2026", dataKind: "TESTDATEN" },
  ]);
  const row = s.db
    .prepare("SELECT payload FROM MarketCoverage WHERE scanId=?")
    .get(scanId) as { payload: string };
  assert.equal(JSON.parse(row.payload).length, 1);
  s.db.prepare("UPDATE ScanRuns SET state='FEHLER' WHERE id=?").run(scanId);
  captureCoverage(s, scanId, []);
  assert.equal(
    JSON.parse(
      (
        s.db
          .prepare("SELECT payload FROM MarketCoverage WHERE scanId=?")
          .get(scanId) as { payload: string }
      ).payload,
    ).length,
    1,
  );
  s.close();
});
test("Markets API authentication, scope, evidence validation and persistence", async () => {
  const s = new Store(":memory:");
  const app = createApp(s, new Scanner(s), token);
  const auth = { Authorization: "Bearer " + token };
  await request(app).get("/api/markets").expect(401);
  const response = await request(app).get("/api/markets").set(auth).expect(200);
  assert.equal(response.body.markets.length, 10);
  assert.equal(
    response.body.markets.find((m: { id: string }) => m.id === "products")
      .state,
    "NICHT VERFÜGBAR",
  );
  await request(app).get("/api/markets?scope=bad").set(auth).expect(400);
  const evidence = {
    marketId: "btc-eur",
    title: "Testquelle",
    url: "https://www.ecb.europa.eu/",
    eventDate: "2026-10-15",
    kind: "HYPOTHESE",
    note: "Unbewiesene Testhypothese",
  };
  const r = await request(app)
    .post("/api/markets/evidence")
    .set(auth)
    .send(evidence)
    .expect(201);
  const view = await request(app).get("/api/markets").set(auth).expect(200);
  assert.equal(
    view.body.markets.find((m: { id: string }) => m.id === "btc-eur")
      .evidence[0].kind,
    "HYPOTHESE",
  );
  for (const url of [
    "javascript:alert(1)",
    "http://example.org",
    "https://user:pass@example.org",
  ])
    await request(app)
      .post("/api/markets/evidence")
      .set(auth)
      .send({ ...evidence, url })
      .expect(400);
  await request(app)
    .post("/api/markets/evidence")
    .set(auth)
    .send({ ...evidence, marketId: "BOGUS" })
    .expect(400);
  await request(app)
    .delete("/api/markets/evidence/" + r.body.id)
    .set(auth)
    .expect(200);
  await request(app)
    .delete("/api/markets/evidence/" + r.body.id)
    .set(auth)
    .expect(404);
  s.close();
});
test("Recorded live provider fixtures parse reproducibly", () => {
  const btc = parseCandles(
    JSON.parse(
      readFileSync(
        new URL("./fixtures/coinbase-live.json", import.meta.url),
        "utf8",
      ),
    ),
    now,
  );
  const ecb = parseEcb(
    readFileSync(new URL("./fixtures/ecb-live.xml", import.meta.url), "utf8"),
  );
  assert.ok(btc.length >= 14);
  assert.ok(ecb.length >= 14);
  assert.equal(priceTrend(btc, now).asOf, "2026-10-15");
  assert.ok(priceTrend(ecb, now, true).current !== null);
});
test("Official context feed imports real dated releases, rejects unsafe links, never claims a cause", async () => {
  const { parseNews } = await import("../server/markets.ts");
  const news = parseNews(
    readFileSync(
      new URL("./fixtures/ecb-news-live.xml", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(news.length > 0);
  assert.ok(news.every((n) => n.url.startsWith("https://www.ecb.europa.eu/")));
  assert.throws(() =>
    parseNews(
      "<item><title>Fake</title><link>javascript:alert(1)</link><pubDate>Wed, 14 Oct 2026 02:00:00 +0200</pubDate></item>",
    ),
  );
});
test("Official Eurostat retail and industry series validate units, dimensions, gaps and provisional flags", async () => {
  const { parseEurostat, monthlyTrend } = await import("../server/markets.ts");
  const retail = JSON.parse(
    readFileSync(
      new URL("./fixtures/eurostat-retail-live.json", import.meta.url),
      "utf8",
    ),
  );
  const points = parseEurostat(retail, "products");
  assert.equal(points.length, 20);
  assert.equal(points.at(-1)!.date, "2026-08-01");
  assert.equal(points[0].flag, "p");
  assert.ok(monthlyTrend(points, now).current !== null);
  assert.equal(
    monthlyTrend(points, new Date("2027-06-01")).state,
    "ZU WENIG DATEN",
  );
  assert.equal(
    monthlyTrend(
      points.filter((p) => p.date !== "2026-06-01"),
      now,
    ).state,
    "ZU WENIG DATEN",
  );
  assert.throws(() => parseEurostat(retail, "industries"), /Dimension/);
  const industry = parseEurostat(
    JSON.parse(
      readFileSync(
        new URL("./fixtures/eurostat-industry-live.json", import.meta.url),
        "utf8",
      ),
    ),
    "industries",
  );
  assert.equal(industry.length, 20);
  assert.ok(monthlyTrend(industry, now).percent !== null);
  assert.throws(
    () =>
      parseEurostat({ ...retail, size: [1, 1, 1, 1, 1, 2, 20] }, "products"),
    /Zeitreihe/,
  );
});

test("Regional scope reports scan-time settings and a later source error remains visible", () => {
  const s = new Store(":memory:");
  const scanId = Number(
    s.db
      .prepare(
        "INSERT INTO ScanRuns(source,startedAt,finishedAt,state,query) VALUES('ted',?,?,'SUCCESS','publication-date >= 20260717')",
      )
      .run(now.toISOString(), now.toISOString()).lastInsertRowid,
  );
  captureCoverage(s, scanId, [], { ...s.settings(), radius: 30 });
  s.setSettings({ ...s.settings(), radius: 90 });
  const view = marketOverview(s, now, true).find(
    (m) => m.id === "ted-clearing",
  )!;
  assert.match(view.scopeLabel, /30 km/);
  s.db
    .prepare(
      "UPDATE Sources SET state='FEHLER',lastError='Quelle nicht erreichbar' WHERE id='ted'",
    )
    .run();
  const failed = marketOverview(s, now, true).find(
    (m) => m.id === "ted-clearing",
  )!;
  assert.equal(failed.state, "FEHLER");
  assert.equal(failed.error, "Quelle nicht erreichbar");
  assert.ok(failed.lastSuccess);
  s.close();
});
