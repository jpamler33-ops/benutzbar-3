import { z } from "zod";
import type { Store } from "./db.ts";
import type { Point, Definition } from "./markets.ts";
export const stocksSchema = z
  .array(
    z
      .object({
        symbol: z.string().regex(/^[A-Z][A-Z0-9.-]{0,11}$/),
        name: z.string().trim().min(1).max(80),
      })
      .strict(),
  )
  .min(1)
  .max(8)
  .refine(
    (rows) => new Set(rows.map((r) => r.symbol)).size === rows.length,
    "Jedes Symbol nur einmal",
  );
export function migrateStocks(store: Store) {
  store.db.exec(
    `CREATE TABLE IF NOT EXISTS MarketStocks(symbol TEXT PRIMARY KEY,name TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1);INSERT OR IGNORE INTO MarketStocks VALUES('IBM','IBM · US-Aktie',1);INSERT OR IGNORE INTO Migrations VALUES(7,strftime('%Y-%m-%dT%H:%M:%fZ','now'));`,
  );
}
export function stocks(store: Store) {
  return store.db
    .prepare(
      "SELECT symbol,name FROM MarketStocks WHERE enabled=1 ORDER BY symbol",
    )
    .all() as unknown as { symbol: string; name: string }[];
}
export function stockDefinitions(store: Store): Definition[] {
  return stocks(store).map((s) => ({
    id: "stock-" + s.symbol,
    name: s.name,
    group: "Aktien",
    metric: "Historischer Tages-Schlusskurs · Nasdaq",
    unit: "USD je Anteil",
    source: "Nasdaq · historische Kurse",
    url: `https://www.nasdaq.com/market-activity/stocks/${s.symbol.toLowerCase()}/historical`,
    limitation:
      "US-Notierung in USD. Historische Schlusskurse sind keine Echtzeitkurse; Kapitalmaßnahmen und Anbietermethodik können Zeitvergleiche beeinflussen. Öffentlicher Web-Endpunkt ohne vertragliche Verfügbarkeitsgarantie.",
    check:
      "Unternehmensmeldungen, Quartalsberichte, Kapitalmaßnahmen und Vergleichsindex prüfen; Kurssteigerung ist keine Gewinnzusage.",
  }));
}
export function setStocks(store: Store, input: unknown) {
  const rows = stocksSchema.parse(input);
  store.db.exec("BEGIN IMMEDIATE");
  try {
    store.db.prepare("UPDATE MarketStocks SET enabled=0").run();
    for (const row of rows) {
      store.db
        .prepare(
          "INSERT INTO MarketStocks VALUES(?,?,1) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name,enabled=1",
        )
        .run(row.symbol, row.name);
      store.db
        .prepare(
          "INSERT OR IGNORE INTO MarketSeries(id,state) VALUES(?,'NICHT VERFÜGBAR')",
        )
        .run("stock-" + row.symbol);
    }
    store.db.exec("COMMIT");
  } catch (e) {
    store.db.exec("ROLLBACK");
    throw e;
  }
}
export function nasdaqUrl(symbol: string, now = new Date()) {
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol))
    throw new Error("Ungültiges Aktiensymbol");
  const end = new Date(now.getTime() - 86400000).toISOString().slice(0, 10),
    start = new Date(now.getTime() - 120 * 86400000).toISOString().slice(0, 10);
  return `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=stocks&fromdate=${start}&todate=${end}&limit=250&offset=0`;
}
export function parseNasdaq(raw: unknown, symbol: string): Point[] {
  const p = z
    .object({
      data: z.object({
        symbol: z.string(),
        totalRecords: z.coerce.number().int().nonnegative(),
        tradesTable: z.object({
          rows: z.array(
            z.object({
              date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
              close: z.string(),
            }),
          ),
        }),
      }),
      status: z.object({ rCode: z.number() }),
    })
    .parse(raw);
  if (
    p.status.rCode !== 200 ||
    p.data.symbol.toUpperCase() !== symbol.toUpperCase()
  )
    throw new Error("Nasdaq: unerwartete Antwort oder Instrument");
  if (p.data.totalRecords > p.data.tradesTable.rows.length)
    throw new Error("Nasdaq: unvollständige historische Antwort");
  if (!p.data.tradesTable.rows.length)
    throw new Error("Nasdaq: keine Tageskurse");
  return p.data.tradesTable.rows
    .map((r) => {
      const [month, day, year] = r.date.split("/");
      const date = `${year}-${month}-${day}`;
      z.iso.date().parse(date);
      const value = Number(r.close.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Nasdaq: ungültiger Schlusskurs");
      return { date, value };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
