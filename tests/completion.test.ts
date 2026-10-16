import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import request from "supertest";
import { Store } from "../server/db.ts";
import { Scanner } from "../server/scanner.ts";
import { createApp } from "../server/api.ts";
import {
  GermanAdapter,
  parseOcds,
  parseArchive,
  parseEforms,
  parseEformsArchive,
  latestExportDay,
} from "../server/german.ts";
import { parseNasdaq, nasdaqUrl, setStocks, stocks } from "../server/stock.ts";
import { parsePublicFeed } from "../server/news.ts";
import { definitions, priceTrend, type News } from "../server/markets.ts";
import { explainMarket } from "../server/explanations.ts";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/german-ocds-live.json", import.meta.url),
    "utf8",
  ),
);
const xml = readFileSync(
  new URL("./fixtures/german-eforms-live.xml", import.meta.url),
  "utf8",
);
const id = fixture.releases[0].id as string;
const noWait = async () => {};
const token = "completion-test-key-at-least-24-characters";
test("German official OCDS supports UUID/numeric IDs, explicit unknowns and source provenance", () => {
  const n = parseOcds(fixture)[0];
  assert.equal(n.sourceId, id);
  assert.equal(n.source, "bekanntmachung");
  assert.match(n.url, /oeffentlichevergabe/);
  assert.ok(n.locations.includes("Regensburg"));
  assert.equal(n.deadlines.length, 0);
  const numeric = structuredClone(fixture);
  numeric.releases[0].id = "25933846";
  assert.equal(parseOcds(numeric)[0].sourceId, "25933846");
  assert.throws(() =>
    parseOcds({
      ...fixture,
      releases: [{ ...fixture.releases[0], id: "../evil" }],
    }),
  );
});
test("ZIP parsing accepts empty results, retains latest version and rejects traversal or decompression bombs", () => {
  assert.deepEqual(parseArchive(zipSync({})), []);
  const newer = structuredClone(fixture);
  newer.releases[0].tender.title = "Version 10";
  const zip = zipSync({
    [`${id}-2.json`]: strToU8(JSON.stringify(fixture)),
    [`${id}-10.json`]: strToU8(JSON.stringify(newer)),
  });
  assert.equal(parseArchive(zip)[0].title, "Version 10");
  assert.throws(
    () => parseArchive(zipSync({ "../outside.json": strToU8("{}") })),
    /ZIP/,
  );
  assert.throws(
    () => parseArchive(zipSync({ "huge.json": new Uint8Array(4000000) })),
    /Sicherheits/,
  );
});
test("eForms supplement preserves exact deadline/timezone, qualifications and explicit SME statement", () => {
  const data = parseEforms(xml);
  assert.deepEqual(data.deadlines, ["2026-11-18T12:30:00.000Z"]);
  assert.match(data.requirements!, /Referenz/);
  assert.equal(data.sme, false);
  const rows = parseEformsArchive(
    zipSync({
      [`${id}-01.xml`]: strToU8(xml),
      "irrelevant-01.xml": strToU8("bad"),
    }),
    new Set([id]),
  );
  assert.equal(rows.size, 1);
  assert.equal(rows.get(id)!.sha256, data.sha256);
  assert.throws(() => parseEforms("<!DOCTYPE x><x/>"), /Unzulässig/);
});
test("Official export day follows Berlin midnight across summer/winter time", () => {
  assert.equal(latestExportDay(new Date("2026-10-15T22:30:00Z")), "2026-10-15");
  assert.equal(latestExportDay(new Date("2026-12-15T23:30:00Z")), "2026-12-15");
});
test("German scanner integrates both official archives, checkpoints, deduplication and source updates", async () => {
  const db = new Store(":memory:");
  db.setSettings({ ...db.settings(), lookbackDays: 1 });
  let original = structuredClone(fixture);
  const calls: string[] = [];
  const adapter = new GermanAdapter(
    db,
    (async (u) => {
      calls.push(String(u));
      return new Response(
        zipSync(
          String(u).includes("format=eforms.zip")
            ? { [`${id}-01.xml`]: strToU8(xml) }
            : { [`${id}-01.json`]: strToU8(JSON.stringify(original)) },
        ),
      );
    }) as typeof fetch,
    noWait,
  );
  const scanner = new Scanner(db, adapter);
  const first = await scanner.scan();
  assert.equal(first.inserted, 1);
  assert.equal(db.list()[0].deadlines[0], "2026-11-18T12:30:00.000Z");
  assert.equal((await scanner.scan()).inserted, 0);
  assert.equal(db.list().length, 1);
  const rowId = db.list()[0].id;
  db.update(rowId, { status: "INTERESSANT" });
  original.releases[0].tender.description += " Quelle aktualisiert";
  assert.equal((await scanner.scan()).changed, 1);
  assert.equal(db.list()[0].status, "INTERESSANT");
  assert.equal(calls.length, 6);
  assert.equal(
    (
      db
        .sources()
        .find((s) => (s as { id: string }).id === "bekanntmachung") as {
        state: string;
      }
    ).state,
    "LIVE-DATEN",
  );
  db.close();
});
test("German source failures are retried and never recorded as successful imports", async () => {
  const db = new Store(":memory:");
  let calls = 0;
  const adapter = new GermanAdapter(
    db,
    (async () => {
      calls++;
      return new Response("down", { status: 503 });
    }) as typeof fetch,
    noWait,
  );
  await assert.rejects(adapter.archive("2026-10-15"), /HTTP 503/);
  assert.equal(calls, 3);
  assert.equal(db.db.prepare("SELECT * FROM ImportDays").all().length, 0);
  db.close();
});
test("Nasdaq official response parses real closes, validates symbol and detects truncation", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL("./fixtures/nasdaq-ibm-live.json", import.meta.url),
      "utf8",
    ),
  );
  const p = parseNasdaq(raw, "IBM");
  assert.equal(p.at(-1)!.value, 234.12);
  assert.equal(p.at(-1)!.date, "2026-10-15");
  assert.throws(() => parseNasdaq(raw, "AAPL"), /Instrument/);
  assert.throws(
    () =>
      parseNasdaq({ ...raw, data: { ...raw.data, totalRecords: 999 } }, "IBM"),
    /unvollständig/,
  );
  assert.throws(() => nasdaqUrl("../evil"));
  assert.match(nasdaqUrl("IBM", new Date("2026-10-16")), /todate=2026-10-15/);
});
test("Official issuer/protocol feeds are parsed safely and remain attributed events", () => {
  const ibm = parsePublicFeed(
    readFileSync(
      new URL("./fixtures/ibm-news-live.xml", import.meta.url),
      "utf8",
    ),
    ["newsroom.ibm.com"],
    "IBM",
  );
  const eth = parsePublicFeed(
    readFileSync(
      new URL("./fixtures/eth-news-live.xml", import.meta.url),
      "utf8",
    ),
    ["blog.ethereum.org"],
    "Ethereum",
  );
  assert.ok(ibm.length);
  assert.ok(eth.length);
  assert.throws(() => parsePublicFeed("<!DOCTYPE foo><rss/>", ["x"], "x"));
  assert.throws(() =>
    parsePublicFeed(
      readFileSync(
        new URL("./fixtures/ibm-news-live.xml", import.meta.url),
        "utf8",
      ),
      ["evil.org"],
      "x",
    ),
  );
});
test("Automatic explanations show measured buyer contributions and dated unproven hypotheses", () => {
  const def = definitions.find((d) => d.id === "ted-demolition")!;
  const trend = {
    state: "STEIGT" as const,
    percent: 100,
    current: 20,
    previous: 10,
    currentPeriod: "2026-09-18 – 2026-10-15",
    previousPeriod: "2026-08-21 – 2026-09-17",
    explanation: "20 statt 10",
    points: [],
    asOf: "2026-10-15",
  };
  const rows = Array.from({ length: 3 }, () => ({
    published: "2026-10-01",
    category: "Demontage & Rückbau",
    regional: true,
    buyer: "Stadt Test",
    title: "Rückbau",
    url: "https://ted.europa.eu/",
  }));
  const result = explainMarket(def, trend, [], rows);
  assert.ok(
    result.some(
      (r) => r.kind === "MESSBEITRAG" && r.detail.includes("3 statt 0"),
    ),
  );
  const source: News = {
    title: "Interest rate decision",
    date: "2026-10-10",
    url: "https://www.ecb.europa.eu/press/",
    source: "EZB",
  };
  const fx = explainMarket(
    definitions.find((d) => d.id === "eur-usd")!,
    trend,
    [source],
  );
  assert.ok(
    fx.some((r) => r.kind === "HYPOTHESE" && r.sources[0].url === source.url),
  );
  const future = explainMarket(
    definitions.find((d) => d.id === "eur-usd")!,
    trend,
    [{ ...source, date: "2026-10-20" }],
  );
  assert.equal(
    future.some((r) => r.kind === "HYPOTHESE"),
    false,
  );
  assert.ok(fx.some((r) => r.kind === "DATENLÜCKE"));
});
test("Stock watchlist persists and authenticated API rejects duplicate or malicious symbols", async () => {
  const db = new Store(":memory:");
  setStocks(db, [
    { symbol: "IBM", name: "IBM" },
    { symbol: "AAPL", name: "Apple" },
  ]);
  assert.equal(stocks(db).length, 2);
  const app = createApp(db, new Scanner(db), token);
  await request(app).put("/api/markets/watchlist").send([]).expect(401);
  const auth = { Authorization: "Bearer " + token };
  await request(app)
    .put("/api/markets/watchlist")
    .set(auth)
    .send([{ symbol: "../bad", name: "x" }])
    .expect(400);
  await request(app)
    .put("/api/markets/watchlist")
    .set(auth)
    .send([
      { symbol: "IBM", name: "x" },
      { symbol: "IBM", name: "x" },
    ])
    .expect(400);
  const r = await request(app).get("/api/markets").set(auth).expect(200);
  assert.equal(r.body.watchlist.length, 2);
  assert.ok(r.body.markets.find((m: { id: string }) => m.id === "stock-AAPL"));
  await request(app)
    .post("/api/markets/evidence")
    .set(auth)
    .send({
      marketId: "stock-UNSET",
      title: "Test",
      url: "https://example.org/",
      eventDate: "2026-10-15",
      kind: "HYPOTHESE",
      note: "Unconfigured",
    })
    .expect(400);
  db.close();
});
