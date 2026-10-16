import {
  explainMarket,
  type Explanation,
  type SnapshotMember,
} from "./explanations.ts";
import {
  stockDefinitions,
  migrateStocks,
  stocks,
  nasdaqUrl,
  parseNasdaq,
} from "./stock.ts";
import { newsFeeds, parsePublicFeed } from "./news.ts";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Store } from "./db.ts";
import type { Notice, Settings } from "./model.ts";
import { assess } from "./scoring.ts";
const utc = () => new Date().toISOString();
export const marketIds = [
  "ted-clearing",
  "ted-moving",
  "ted-demolition",
  "ted-waste",
  "btc-eur",
  "eth-eur",
  "eur-usd",
  "stock-IBM",
  "products",
  "industries",
] as const;
export const marketIdSchema = z.union([
  z.enum(marketIds),
  z.string().regex(/^stock-[A-Z][A-Z0-9.-]{0,11}$/),
]);
export interface Point {
  date: string;
  value: number;
  flag?: string;
}
export interface Definition {
  id: string;
  name: string;
  group: string;
  metric: string;
  unit: string;
  source: string;
  url: string;
  limitation: string;
  check: string;
}
export const definitions: Definition[] = [
  {
    id: "ted-clearing",
    name: "Entrümpelung & Räumung",
    group: "Dienstleistungen",
    metric: "Veröffentlichte Bekanntmachungen im Suchausschnitt",
    unit: "Bekanntmachungen",
    source: "TED Search API",
    url: "https://docs.ted.europa.eu/api/latest/search.html",
    limitation:
      "Nur passende deutsche TED-Wettbewerbsbekanntmachungen. Weder der Gesamtmarkt noch private Nachfrage werden gemessen.",
    check:
      "Auftraggeber, Losgrößen und regionale Eignung der zusätzlichen Ausschreibungen prüfen.",
  },
  {
    id: "ted-moving",
    name: "Umzüge & Transport",
    group: "Dienstleistungen",
    metric: "Veröffentlichte Bekanntmachungen im Suchausschnitt",
    unit: "Bekanntmachungen",
    source: "TED Search API",
    url: "https://docs.ted.europa.eu/api/latest/search.html",
    limitation:
      "Keyword-/CPV-Auswahl für L&P. Keine repräsentative Messung aller Umzugsaufträge.",
    check:
      "Prüfen, ob die zusätzlichen Bekanntmachungen von einzelnen Großauftraggebern stammen.",
  },
  {
    id: "ted-demolition",
    name: "Demontage & Rückbau",
    group: "Dienstleistungen",
    metric: "Veröffentlichte Bekanntmachungen im Suchausschnitt",
    unit: "Bekanntmachungen",
    source: "TED Search API",
    url: "https://docs.ted.europa.eu/api/latest/search.html",
    limitation:
      "Anzahl der Veröffentlichungen, nicht Auftragsvolumen oder Branchenumsatz.",
    check:
      "Bauprojekte, Genehmigungen und konkrete Leistungsbeschreibungen als mögliche Einflussfaktoren recherchieren.",
  },
  {
    id: "ted-waste",
    name: "Entsorgung & Container",
    group: "Dienstleistungen",
    metric: "Veröffentlichte Bekanntmachungen im Suchausschnitt",
    unit: "Bekanntmachungen",
    source: "TED Search API",
    url: "https://docs.ted.europa.eu/api/latest/search.html",
    limitation:
      "Auch industrielle Großaufträge enthalten. Mehr Bekanntmachungen belegen keine steigenden Entsorgungspreise.",
    check:
      "Losaufteilung und wiederkehrende Vergaben vom tatsächlichen Mehrbedarf unterscheiden.",
  },
  {
    id: "btc-eur",
    name: "Bitcoin / Euro",
    group: "Krypto",
    metric: "Täglicher Schlusskurs · Coinbase",
    unit: "EUR je BTC",
    source: "Coinbase Exchange",
    url: "https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles",
    limitation:
      "Ein Handelsplatz; keine Messung von weltweitem Kapitalzufluss. Nur abgeschlossene UTC-Tageskerzen.",
    check:
      "Zeitgleiche regulatorische Meldungen, ETF-Berichte und Liquiditätsdaten prüfen. Ohne passende Quellen ist keine Ursache belegt.",
  },
  {
    id: "eth-eur",
    name: "Ethereum / Euro",
    group: "Krypto",
    metric: "Täglicher Schlusskurs · Coinbase",
    unit: "EUR je ETH",
    source: "Coinbase Exchange",
    url: "https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles",
    limitation:
      "Ein Handelsplatz; Kursbewegung ist kein Nachweis wachsender Nutzung. Nur abgeschlossene UTC-Tageskerzen.",
    check:
      "Netzwerknutzung, Protokolländerungen und regulatorische Meldungen mit Zeitbezug prüfen.",
  },
  {
    id: "eur-usd",
    name: "Euro / US-Dollar",
    group: "Devisen",
    metric: "EZB-Referenzkurs · US-Dollar für 1 Euro",
    unit: "USD je EUR",
    source: "Europäische Zentralbank",
    url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    limitation:
      "Referenzkurs an Veröffentlichungstagen; kein handelbarer Echtzeitkurs. Anstieg bedeutet stärkerer Euro gegenüber US-Dollar.",
    check:
      "Offizielle Zinsentscheidungen und Inflationsveröffentlichungen beider Währungsräume zeitlich abgleichen.",
  },
  {
    id: "stock-IBM",
    name: "IBM · US-Aktie",
    group: "Aktien",
    metric: "Täglicher unbereinigter Schlusskurs",
    unit: "USD je Aktie",
    source: "Alpha Vantage",
    url: "https://www.alphavantage.co/documentation/#daily",
    limitation:
      "Beispiel einer US-Aktienbeobachtung, keine Abdeckung aller Aktien. Unbereinigte Kurse: Splits und Dividenden können Vergleiche verzerren.",
    check:
      "Quartalsbericht, Unternehmensmeldungen, Splits und Vergleichsindex prüfen; steigender Kurs bedeutet nicht automatisch steigenden Gewinn.",
  },
  {
    id: "products",
    name: "Einzelhandel Deutschland",
    group: "Produkte",
    metric: "Monatliches reales Verkaufsvolumen · saison-/kalenderbereinigt",
    unit: "Index 2021 = 100",
    source: "Eurostat · sts_trtu_m",
    url: "https://ec.europa.eu/eurostat/databrowser/view/sts_trtu_m/default/table",
    limitation:
      "Gesamter Einzelhandel ohne Kraftfahrzeuge, keine einzelnen Produkte oder Suchanfragen. Indexwerte und mögliche vorläufige Daten (p), kein Umsatz in Euro.",
    check:
      "Produktgruppen, reale Mengen, Preise und amtliche Veröffentlichungen prüfen; ein Gesamtindex ersetzt keine einzelne Produktanalyse.",
  },
  {
    id: "industries",
    name: "Industrieproduktion Deutschland",
    group: "Branchen",
    metric: "Monatliche Produktion · B–D · saison-/kalenderbereinigt",
    unit: "Index 2021 = 100",
    source: "Eurostat · sts_inpr_m",
    url: "https://ec.europa.eu/eurostat/databrowser/view/sts_inpr_m/default/table",
    limitation:
      "Bergbau, verarbeitendes Gewerbe und Energieversorgung, kein gesamtwirtschaftlicher Index und keine Abdeckung aller Branchen. Revisionen möglich.",
    check:
      "Amtliche Branchenaufschlüsselung und Auftragseingänge prüfen; Produktion, Nachfrage und Profitabilität unterscheiden.",
  },
];
const daySchema = z.iso.date();
export const pointSchema = z.object({
  date: daySchema,
  value: z.number().finite().nonnegative(),
  flag: z.string().max(100).optional(),
});
const dayMs = 86400000;
export const day = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: string, n: number) =>
  day(new Date(Date.parse(d) + n * dayMs));
export interface Trend {
  state: "STEIGT" | "FÄLLT" | "STABIL" | "ZU WENIG DATEN";
  percent: number | null;
  current: number | null;
  previous: number | null;
  currentPeriod: string;
  previousPeriod: string;
  explanation: string;
  points: Point[];
  asOf: string | null;
}
export function priceTrend(
  input: Point[],
  now = new Date(),
  stock = false,
): Trend {
  const today = day(now);
  const points = [...new Map(input.map((p) => [p.date, p])).values()]
    .filter((p) => p.date < today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = points.at(-1)?.date ?? null;
  const base: Trend = {
    state: "ZU WENIG DATEN",
    percent: null,
    current: null,
    previous: null,
    currentPeriod: "",
    previousPeriod: "",
    explanation:
      "Für zwei vergleichbare Wochen liegen noch nicht genügend aktuelle Daten vor.",
    points,
    asOf: last,
  };
  if (!last || Date.parse(today) - Date.parse(last) > 4 * dayMs)
    return {
      ...base,
      explanation: last
        ? "Letzter Datenpunkt ist älter als vier Tage. Kein aktuelles Trendsignal."
        : base.explanation,
    };
  const previousStart = shift(last, -13),
    currentStart = shift(last, -6),
    previousEnd = shift(last, -7);
  const current = points.filter(
    (p) => p.date >= currentStart && p.date <= last,
  );
  const previous = points.filter(
    (p) => p.date >= previousStart && p.date <= previousEnd,
  );
  const min = stock ? 4 : 7;
  if (current.length < min || previous.length < min) return base;
  const mean = (p: Point[]) => p.reduce((a, b) => a + b.value, 0) / p.length;
  const a = mean(current),
    b = mean(previous);
  const percent = b === 0 ? null : (a / b - 1) * 100;
  return {
    state:
      percent === null
        ? "ZU WENIG DATEN"
        : percent > 0.5
          ? "STEIGT"
          : percent < -0.5
            ? "FÄLLT"
            : "STABIL",
    percent,
    current: a,
    previous: b,
    currentPeriod: `${currentStart} – ${last}`,
    previousPeriod: `${previousStart} – ${previousEnd}`,
    explanation:
      percent === null
        ? "Vergleichsbasis ist null; keine Prozentänderung berechenbar."
        : `Das Mittel der veröffentlichten Tageswerte liegt ${Math.abs(percent).toFixed(2)} % ${percent >= 0 ? "über" : "unter"} dem Mittel des vorigen siebentägigen Vergleichsfensters. Das erklärt das gemessene Signal, nicht seine wirtschaftliche Ursache.`,
    points,
    asOf: last,
  };
}
export function countTrend(
  rows: { published: string; category: string; regional: boolean }[],
  category: string,
  start: string,
  end: string,
): Trend {
  const first = shift(end, -55),
    boundary = shift(end, -27);
  const points: Point[] = Array.from({ length: 56 }, (_, i) => ({
    date: shift(first, i),
    value: 0,
  }));
  for (const row of rows) {
    const p = points.find(
      (p) => p.date === row.published && row.category === category,
    );
    if (p) p.value++;
  }
  const a = points.slice(28).reduce((s, p) => s + p.value, 0),
    b = points.slice(0, 28).reduce((s, p) => s + p.value, 0);
  const percent = b > 0 ? (a / b - 1) * 100 : null;
  const enough = start <= first && a + b >= 10;
  return {
    state:
      !enough || percent === null
        ? "ZU WENIG DATEN"
        : percent > 5
          ? "STEIGT"
          : percent < -5
            ? "FÄLLT"
            : "STABIL",
    percent: enough ? percent : null,
    current: enough ? a : null,
    previous: enough ? b : null,
    currentPeriod: `${boundary} – ${end}`,
    previousPeriod: `${first} – ${shift(boundary, -1)}`,
    explanation:
      start > first
        ? "Der erfolgreiche Scan deckt keine zwei vollständigen 28-Tage-Fenster ab."
        : a + b < 10
          ? "Weniger als zehn Bekanntmachungen in beiden Perioden zusammen: zu kleine Stichprobe für ein Trendsignal."
          : b === 0
            ? `${a} beobachtete Veröffentlichungen nach einer Nullperiode; eine prozentuale Wachstumsrate wäre nicht sinnvoll.`
            : `Im identischen Suchausschnitt wurden ${a} statt ${b} Bekanntmachungen veröffentlicht (${percent!.toFixed(1)} %). Los-/Versionsaufteilung, Veröffentlichungstermine und Auswahl können das Signal beeinflussen; höhere Marktnachfrage ist damit nicht bewiesen.`,
    points,
    asOf: end,
  };
}
export function migrateMarkets(s: Store) {
  s.db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE IF NOT EXISTS MarketSeries(id TEXT PRIMARY KEY,state TEXT NOT NULL,lastSuccess TEXT,lastAttempt TEXT,error TEXT);
 CREATE TABLE IF NOT EXISTS MarketPoints(seriesId TEXT NOT NULL REFERENCES MarketSeries(id),date TEXT NOT NULL,value REAL NOT NULL CHECK(value>=0),PRIMARY KEY(seriesId,date));
 CREATE TABLE IF NOT EXISTS MarketPointUpdates(id INTEGER PRIMARY KEY,seriesId TEXT NOT NULL,date TEXT NOT NULL,before REAL NOT NULL,after REAL NOT NULL,changedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS MarketEvidence(id INTEGER PRIMARY KEY,marketId TEXT NOT NULL,title TEXT NOT NULL,url TEXT NOT NULL,eventDate TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('QUELLENHINWEIS','HYPOTHESE')),note TEXT NOT NULL,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS MarketCoverage(scanId INTEGER PRIMARY KEY REFERENCES ScanRuns(id),start TEXT NOT NULL,end TEXT NOT NULL,settings TEXT NOT NULL,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS MarketLock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT,expiresAt TEXT);
 INSERT OR IGNORE INTO MarketLock(id) VALUES(1);
 INSERT OR IGNORE INTO Migrations VALUES(3,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 CREATE TABLE IF NOT EXISTS MarketPointFlags(seriesId TEXT NOT NULL REFERENCES MarketSeries(id),date TEXT NOT NULL,flag TEXT NOT NULL,PRIMARY KEY(seriesId,date));
 INSERT OR IGNORE INTO Migrations VALUES(5,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 CREATE TABLE IF NOT EXISTS MarketNews(url TEXT PRIMARY KEY,title TEXT NOT NULL,date TEXT NOT NULL,source TEXT NOT NULL);
 INSERT OR IGNORE INTO MarketSeries(id,state) VALUES('ecb-news','NICHT VERFÜGBAR');
 INSERT OR IGNORE INTO Migrations VALUES(4,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 COMMIT;`);
  for (const def of definitions)
    s.db
      .prepare(
        "INSERT OR IGNORE INTO MarketSeries(id,state) VALUES(?,'NICHT VERFÜGBAR')",
      )
      .run(def.id);
  migrateStocks(s);
  for (const feed of newsFeeds)
    s.db
      .prepare(
        "INSERT OR IGNORE INTO MarketSeries(id,state) VALUES(?,'NICHT VERFÜGBAR')",
      )
      .run(feed.id);
}
export function captureCoverage(
  s: Store,
  scanId: number,
  notices: Notice[],
  settings: Settings = s.settings(),
) {
  const scan = s.db
    .prepare("SELECT query,finishedAt,state FROM ScanRuns WHERE id=?")
    .get(scanId) as
    | { query: string; finishedAt: string; state: string }
    | undefined;
  if (!scan || scan.state !== "SUCCESS") return;
  const start = scan.query.match(/publication-date >= (\d{4})(\d{2})(\d{2})/);
  if (!start) return;
  const items = [
    ...new Map(
      notices
        .filter((o) => o.dataKind === "LIVE-DATEN")
        .map((o) => [
          o.source + ":" + o.sourceId,
          { ...o, assessment: assess(o, settings) },
        ]),
    ).values(),
  ];
  const payload = items.map((o) => ({
    published: o.published?.slice(0, 10) ?? "",
    category: o.assessment.category,
    regional: o.assessment.regionMatch,
    buyer: o.buyer,
    title: o.title,
    url: o.url,
  }));
  s.db
    .prepare("INSERT OR REPLACE INTO MarketCoverage VALUES(?,?,?,?,?)")
    .run(
      scanId,
      `${start[1]}-${start[2]}-${start[3]}`,
      shift(day(new Date(scan.finishedAt)), -1),
      JSON.stringify(settings),
      JSON.stringify(payload),
    );
}
export const evidenceSchema = z
  .object({
    marketId: marketIdSchema,
    title: z.string().trim().min(3).max(200),
    url: z
      .url()
      .max(2000)
      .refine((s) => {
        const u = new URL(s);
        return u.protocol === "https:" && !u.username && !u.password;
      }, "Öffentlicher HTTPS-Link ohne Zugangsdaten erforderlich"),
    eventDate: daySchema,
    kind: z.enum(["QUELLENHINWEIS", "HYPOTHESE"]),
    note: z.string().trim().min(5).max(4000),
  })
  .strict();
export type MarketView = Definition & {
  state: string;
  lastSuccess: string | null;
  error: string | null;
  trend: Trend;
  evidence: Evidence[];
  context: News[];
  contextState: string;
  scopeLabel: string;
  why: Explanation[];
};
export interface News {
  url: string;
  title: string;
  date: string;
  source: string;
}
export interface Evidence {
  id: number;
  marketId: string;
  title: string;
  url: string;
  eventDate: string;
  kind: "QUELLENHINWEIS" | "HYPOTHESE";
  note: string;
  createdAt: string;
}
export function marketOverview(
  s: Store,
  now = new Date(),
  regional = false,
): MarketView[] {
  const coverage = s.db
    .prepare("SELECT * FROM MarketCoverage ORDER BY scanId DESC LIMIT 1")
    .get() as
    | {
        scanId: number;
        start: string;
        end: string;
        settings: string;
        payload: string;
      }
    | undefined;
  const categories = [
    "Entrümpelung & Räumung",
    "Umzug & Transport",
    "Demontage & Rückbau",
    "Entsorgung & Container",
  ];
  return marketDefinitions(s).map((d, index) => {
    const stored = s.db
      .prepare("SELECT * FROM MarketSeries WHERE id=?")
      .get(d.id) as {
      state: string;
      lastSuccess: string | null;
      error: string | null;
    };
    const points = s.db
      .prepare(
        "SELECT p.date,p.value,f.flag FROM MarketPoints p LEFT JOIN MarketPointFlags f ON p.seriesId=f.seriesId AND p.date=f.date WHERE p.seriesId=? ORDER BY p.date",
      )
      .all(d.id) as unknown as Point[];
    let trend = ["products", "industries"].includes(d.id)
      ? monthlyTrend(points, now)
      : priceTrend(points, now, d.group !== "Krypto");
    const scopeLabel =
      index < 4
        ? regional
          ? `Regional · Zielradius ${coverage ? JSON.parse(coverage.settings).radius : s.settings().radius} km beim Scan`
          : "Deutschland · L&P-Suchprofil beim Scan"
        : "";
    let state = stored.state,
      lastSuccess = stored.lastSuccess,
      error = stored.error;
    if (index < 4) {
      if (coverage) {
        const scan = s.db
          .prepare("SELECT finishedAt FROM ScanRuns WHERE id=?")
          .get(coverage.scanId) as { finishedAt: string };
        const rows = JSON.parse(coverage.payload) as {
          published: string;
          category: string;
          regional: boolean;
        }[];
        trend = countTrend(
          regional ? rows.filter((r) => r.regional) : rows,
          categories[index],
          coverage.start,
          coverage.end,
        );
        state = "LIVE-DATEN";
        lastSuccess = scan.finishedAt;
        if (Date.parse(day(now)) - Date.parse(coverage.end) > 4 * dayMs) {
          trend = {
            ...trend,
            state: "ZU WENIG DATEN",
            percent: null,
            explanation:
              "Der erfolgreiche TED-Suchstand ist älter als vier Tage. Erst erneut scannen.",
          };
        }
      } else
        trend = {
          ...trend,
          explanation:
            "Noch kein erfolgreicher vollständiger Scan mit dokumentierter Abdeckung seit Einführung der Marktanalyse. Jetzt TED scannen.",
        };
    }
    if (index < 4) {
      const source = s.db
        .prepare("SELECT state,lastError FROM Sources WHERE id='ted'")
        .get() as { state: string; lastError: string | null };
      if (source.state === "FEHLER") {
        state = "FEHLER";
        error = source.lastError;
      }
    }
    const recent = s.db
      .prepare(
        "SELECT * FROM MarketNews WHERE date>=? AND date<=? ORDER BY date DESC LIMIT 100",
      )
      .all(shift(day(now), -90), day(now)) as unknown as News[];
    const context = recent
      .filter((n) => {
        const host = new URL(n.url).hostname;
        if (host === "www.ecb.europa.eu") return d.group !== "Dienstleistungen";
        if (host === "newsroom.ibm.com") return d.id === "stock-IBM";
        if (host === "blog.ethereum.org") return d.id === "eth-eur";
        return false;
      })
      .slice(0, 30);
    const relatedFeeds =
      d.id === "stock-IBM"
        ? ["ibm-news", "ecb-news"]
        : d.id === "eth-eur"
          ? ["eth-news", "ecb-news"]
          : d.group === "Dienstleistungen"
            ? []
            : ["ecb-news"];
    const contextState = relatedFeeds.length
      ? relatedFeeds
          .map(
            (id) =>
              (
                s.db
                  .prepare("SELECT state FROM MarketSeries WHERE id=?")
                  .get(id) as { state: string }
              )?.state ?? "NICHT VERFÜGBAR",
          )
          .join(" · ")
      : "NICHT VERFÜGBAR";
    const rows: SnapshotMember[] = coverage ? JSON.parse(coverage.payload) : [];
    const why = explainMarket(
      d,
      trend,
      context,
      regional ? rows.filter((r) => r.regional) : rows,
    );
    return {
      ...d,
      state,
      lastSuccess,
      error,
      trend,
      context,
      contextState,
      scopeLabel,
      why,
      evidence: s.db
        .prepare(
          "SELECT * FROM MarketEvidence WHERE marketId=? ORDER BY eventDate DESC,id DESC",
        )
        .all(d.id) as unknown as Evidence[],
    };
  });
}
export function parseCandles(raw: unknown, now = new Date()): Point[] {
  const candles = z
    .array(
      z.tuple([
        z.number().int().nonnegative(),
        z.number().nonnegative(),
        z.number().nonnegative(),
        z.number().nonnegative(),
        z.number().nonnegative(),
        z.number().nonnegative(),
      ]),
    )
    .min(1)
    .max(1000)
    .parse(raw);
  return candles
    .map((c) => ({ date: day(new Date(c[0] * 1000)), value: c[4] }))
    .filter((p) => p.date < day(now) && p.date >= shift(day(now), -90))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function parseEcb(xml: string): Point[] {
  if (!xml.includes("European Central Bank"))
    throw new Error("Unerwartete EZB-Antwort");
  const points: Point[] = [];
  for (const block of xml.matchAll(
    /<Cube time=["'](\d{4}-\d{2}-\d{2})["']>([\s\S]*?)<\/Cube>/g,
  )) {
    const rate = block[2].match(
      /<Cube currency=["']USD["'] rate=["']([\d.]+)["']/,
    );
    if (rate)
      points.push(
        pointSchema.parse({ date: block[1], value: Number(rate[1]) }),
      );
  }
  if (!points.length) throw new Error("Keine USD-Referenzkurse in EZB-Antwort");
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
export function parseAlpha(raw: unknown): Point[] {
  const obj = z.record(z.string(), z.unknown()).parse(raw);
  if (!obj["Time Series (Daily)"])
    throw new Error(
      "Alpha Vantage liefert keine Tageszeitreihe (Schlüssel, Limit oder Berechtigung prüfen).",
    );
  const series = z
    .record(z.string(), z.object({ "4. close": z.string() }))
    .parse(obj["Time Series (Daily)"]);
  return Object.entries(series)
    .map(([date, r]) =>
      pointSchema.parse({ date, value: Number(r["4. close"]) }),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}
export class MarketMonitor {
  constructor(
    private store: Store,
    private fetcher: typeof fetch = fetch,
    private pause: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}
  async download(url: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.fetcher(url, {
          headers: {
            Accept: "application/json, application/xml, text/xml",
            "User-Agent": "OpportunityOS/1.1 public-market-monitor",
          },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          if (
            (response.status === 429 || response.status >= 500) &&
            attempt < 2
          ) {
            const retry = response.headers.get("retry-after");
            const parsed = retry ? Number(retry) : NaN;
            const retryMs = Number.isFinite(parsed)
              ? parsed * 1000
              : retry
                ? Date.parse(retry) - Date.now()
                : 0;
            if (retryMs > 60000)
              throw new Error(
                "Quellenlimit: Retry-After über einer Minute; später erneut versuchen.",
              );
            await this.pause(Math.max(1000 * 2 ** attempt, retryMs || 0));
            continue;
          }
          throw new Error(`Marktquelle HTTP ${response.status}`);
        }
        const text = await response.text();
        if (text.length > 3000000)
          throw new Error("Quellenantwort überschreitet Größenlimit");
        return text;
      } catch (e) {
        if (e instanceof Error && /HTTP|Quellen/.test(e.message)) throw e;
        if (attempt === 2)
          throw new Error("Marktquelle Netzwerkfehler oder Timeout");
        await this.pause(1000 * 2 ** attempt);
      }
    }
    throw new Error("Marktquelle nicht erreichbar");
  }
  save(id: string, points: Point[]) {
    if (points.length < 1) throw new Error("Leere Zeitreihe");
    this.store.db.exec("BEGIN IMMEDIATE");
    try {
      for (const raw of points) {
        const p = pointSchema.parse(raw);
        const old = this.store.db
          .prepare("SELECT value FROM MarketPoints WHERE seriesId=? AND date=?")
          .get(id, p.date) as { value: number } | undefined;
        if (old && old.value !== p.value)
          this.store.db
            .prepare(
              "INSERT INTO MarketPointUpdates(seriesId,date,before,after,changedAt) VALUES(?,?,?,?,?)",
            )
            .run(id, p.date, old.value, p.value, utc());
        this.store.db
          .prepare(
            "INSERT INTO MarketPoints VALUES(?,?,?) ON CONFLICT(seriesId,date) DO UPDATE SET value=excluded.value",
          )
          .run(id, p.date, p.value);
        this.store.db
          .prepare(
            "INSERT INTO MarketPointFlags VALUES(?,?,?) ON CONFLICT(seriesId,date) DO UPDATE SET flag=excluded.flag",
          )
          .run(id, p.date, p.flag ?? "");
      }
      this.store.db
        .prepare(
          "UPDATE MarketSeries SET state='LIVE-DATEN',lastSuccess=?,error=NULL WHERE id=?",
        )
        .run(utc(), id);
      this.store.db.exec("COMMIT");
    } catch (e) {
      this.store.db.exec("ROLLBACK");
      throw e;
    }
  }
  async refresh() {
    const owner = randomUUID();
    const acquired = this.store.db
      .prepare(
        "UPDATE MarketLock SET owner=?,expiresAt=? WHERE id=1 AND (owner IS NULL OR expiresAt<?)",
      )
      .run(owner, new Date(Date.now() + 300000).toISOString(), utc());
    if (!acquired.changes) throw new Error("Marktabruf läuft bereits");
    const results: {
      id: string;
      ok: boolean;
      points?: number;
      error?: string;
    }[] = [];
    const heartbeat = setInterval(
      () =>
        this.store.db
          .prepare("UPDATE MarketLock SET expiresAt=? WHERE owner=?")
          .run(new Date(Date.now() + 300000).toISOString(), owner),
      30000,
    );
    try {
      for (const id of [
        "btc-eur",
        "eth-eur",
        "eur-usd",
        "ecb-news",
        "products",
        "industries",
        ...newsFeeds.map((f) => f.id),
        ...stocks(this.store).map((s) => "stock-" + s.symbol),
      ]) {
        this.store.db
          .prepare("UPDATE MarketSeries SET lastAttempt=? WHERE id=?")
          .run(utc(), id);
        try {
          let points: Point[];
          if (id === "ecb-news" || newsFeeds.some((f) => f.id === id)) {
            const feed = newsFeeds.find((f) => f.id === id);
            const content = await this.download(
              feed?.url ?? "https://www.ecb.europa.eu/rss/press.html",
            );
            const news = feed
              ? parsePublicFeed(content, feed.hosts, feed.name)
              : parseNews(content);
            this.store.db.exec("BEGIN IMMEDIATE");
            try {
              for (const n of news)
                this.store.db
                  .prepare(
                    "INSERT INTO MarketNews VALUES(?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title,date=excluded.date",
                  )
                  .run(n.url, n.title, n.date, n.source);
              this.store.db
                .prepare(
                  "UPDATE MarketSeries SET state='LIVE-DATEN',lastSuccess=?,error=NULL WHERE id=?",
                )
                .run(utc(), id);
              this.store.db.exec("COMMIT");
            } catch (e) {
              this.store.db.exec("ROLLBACK");
              throw e;
            }
            results.push({ id, ok: true, points: news.length });
            continue;
          }
          if (id === "products" || id === "industries")
            points = parseEurostat(
              JSON.parse(await this.download(eurostatUrl(id))),
              id,
            );
          else if (id === "eur-usd")
            points = parseEcb(
              await this.download(
                "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml",
              ),
            );
          else if (id.startsWith("stock-")) {
            const symbol = id.slice(6);
            points = parseNasdaq(
              JSON.parse(await this.download(nasdaqUrl(symbol))),
              symbol,
            );
          } else
            points = parseCandles(
              JSON.parse(
                await this.download(
                  `https://api.exchange.coinbase.com/products/${id.toUpperCase()}/candles?granularity=86400&start=${shift(day(new Date()), -90)}T00%3A00%3A00Z&end=${day(new Date())}T00%3A00%3A00Z`,
                ),
              ),
            );
          this.save(id, points);
          results.push({ id, ok: true, points: points.length });
        } catch (e) {
          const error =
            e instanceof Error ? e.message : "Marktabruf fehlgeschlagen";
          this.store.db
            .prepare(
              "UPDATE MarketSeries SET state='FEHLER',error=? WHERE id=?",
            )
            .run(error, id);
          results.push({ id, ok: false, error });
        }
        await this.pause(id.startsWith("stock-") ? 1000 : 350);
      }
      return results;
    } finally {
      clearInterval(heartbeat);
      this.store.db
        .prepare(
          "UPDATE MarketLock SET owner=NULL,expiresAt=NULL WHERE owner=?",
        )
        .run(owner);
    }
  }
  start() {
    const tick = () => {
      const last = this.store.db
        .prepare("SELECT MAX(lastAttempt) AS last FROM MarketSeries")
        .get() as { last: string | null };
      if (!last.last || Date.now() - Date.parse(last.last) >= 4 * 3600000)
        void this.refresh().catch((e) =>
          console.error("market_monitor", e.message),
        );
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }
}

export function parseNews(xml: string): News[] {
  const decode = (s: string) =>
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(
        /&(amp|lt|gt|quot|apos);/g,
        (_, n: string) =>
          ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[n]!,
      )
      .trim();
  const news: News[] = [];
  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const field = (name: string) =>
      decode(
        item[1].match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`))?.[1] ??
          "",
      );
    const url = field("link"),
      title = field("title"),
      date = new Date(field("pubDate"));
    try {
      const u = new URL(url);
      if (
        u.protocol !== "https:" ||
        u.hostname !== "www.ecb.europa.eu" ||
        u.username ||
        u.password ||
        !title ||
        !Number.isFinite(date.getTime())
      )
        continue;
      news.push({
        url: u.toString(),
        title,
        date: day(date),
        source: "EZB · offizieller Pressefeed",
      });
    } catch {
      continue;
    }
  }
  if (!news.length)
    throw new Error("Keine gültigen Veröffentlichungen im EZB-Pressefeed");
  return news;
}

export function eurostatUrl(id: "products" | "industries") {
  const retail = id === "products";
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 24);
  return `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${retail ? "sts_trtu_m" : "sts_inpr_m"}?geo=DE&unit=I21&s_adj=SCA&nace_r2=${retail ? "G47" : "B-D"}&indic_bt=${retail ? "VOL_SLS" : "PRD"}&sinceTimePeriod=${since.toISOString().slice(0, 7)}`;
}
export function parseEurostat(
  raw: unknown,
  id: "products" | "industries",
): Point[] {
  const schema = z.object({
    source: z.literal("ESTAT"),
    class: z.literal("dataset"),
    id: z.array(z.string()),
    size: z.array(z.number().int().positive()),
    value: z.union([
      z.record(z.string(), z.number().finite().nullable()),
      z.array(z.number().finite().nullable()),
    ]),
    status: z.record(z.string(), z.string()).optional(),
    dimension: z.record(
      z.string(),
      z.object({
        category: z.object({
          index: z.record(z.string(), z.number().int().nonnegative()),
        }),
      }),
    ),
  });
  const r = schema.parse(raw);
  if (
    r.id.length !== r.size.length ||
    !r.id.includes("time") ||
    r.id.some((name, i) => name !== "time" && r.size[i] !== 1)
  )
    throw new Error(
      "Eurostat: mehr als eine Zeitreihe oder ungültige Dimensionen",
    );
  for (const [key, val] of Object.entries({
    geo: "DE",
    unit: "I21",
    s_adj: "SCA",
    freq: "M",
    indic_bt: id === "products" ? "VOL_SLS" : "PRD",
    nace_r2: id === "products" ? "G47" : "B-D",
  })) {
    if (Object.keys(r.dimension[key]?.category.index ?? {}).join(",") !== val)
      throw new Error("Eurostat: unerwartete Dimension " + key);
  }
  const points: Point[] = [];
  for (const [month, index] of Object.entries(
    r.dimension.time.category.index,
  )) {
    if (!/^\d{4}-\d{2}$/.test(month))
      throw new Error("Eurostat: ungültiger Monat");
    const value = r.value[String(index) as keyof typeof r.value];
    if (value === undefined || value === null) continue;
    points.push(
      pointSchema.parse({
        date: month + "-01",
        value,
        flag: r.status?.[String(index)],
      }),
    );
  }
  if (!points.length) throw new Error("Eurostat: keine Indexwerte");
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
export function monthlyTrend(input: Point[], now = new Date()): Trend {
  const month = now.toISOString().slice(0, 7);
  const points = [...new Map(input.map((p) => [p.date, p])).values()]
    .filter((p) => p.date.slice(0, 7) < month)
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = points.at(-1)?.date ?? null;
  const base: Trend = {
    state: "ZU WENIG DATEN",
    percent: null,
    current: null,
    previous: null,
    currentPeriod: "",
    previousPeriod: "",
    explanation:
      "Für zwei Dreimonatsfenster fehlen sechs aufeinanderfolgende aktuelle Monatswerte.",
    points,
    asOf: last,
  };
  if (!last) return base;
  const monthNumber = (d: string) =>
    Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  if (monthNumber(day(now)) - monthNumber(last) > 4)
    return {
      ...base,
      explanation:
        "Der letzte Monatswert ist älter als vier Monate. Kein aktuelles Signal.",
    };
  const six = points.slice(-6);
  if (
    six.length !== 6 ||
    six.some(
      (p, i) =>
        i > 0 && monthNumber(p.date) - monthNumber(six[i - 1].date) !== 1,
    )
  )
    return base;
  const mean = (p: Point[]) => p.reduce((a, b) => a + b.value, 0) / p.length;
  const a = mean(six.slice(3)),
    b = mean(six.slice(0, 3)),
    percent = b === 0 ? null : (a / b - 1) * 100;
  return {
    ...base,
    state:
      percent === null
        ? "ZU WENIG DATEN"
        : percent > 0.5
          ? "STEIGT"
          : percent < -0.5
            ? "FÄLLT"
            : "STABIL",
    percent,
    current: a,
    previous: b,
    currentPeriod: `${six[3].date.slice(0, 7)} – ${six[5].date.slice(0, 7)}`,
    previousPeriod: `${six[0].date.slice(0, 7)} – ${six[2].date.slice(0, 7)}`,
    explanation:
      percent === null
        ? "Die Vergleichsbasis ist null; keine Prozentänderung."
        : `Der Mittelwert der letzten drei veröffentlichten Monatsindizes liegt ${Math.abs(percent).toFixed(2)} % ${percent >= 0 ? "über" : "unter"} dem Mittel der drei Vormonate. Saison- und kalenderbereinigt; vorläufige Werte und Revisionen möglich. Keine Aussage über die Ursache.`,
  };
}

export function marketDefinitions(s: Store): Definition[] {
  return [
    ...definitions.filter((d) => d.group !== "Aktien"),
    ...stockDefinitions(s),
  ];
}
