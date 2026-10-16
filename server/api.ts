import express from "express";
import { stocks, setStocks } from "./stock.ts";
import {
  MarketMonitor,
  marketOverview,
  evidenceSchema,
  marketDefinitions,
} from "./markets.ts";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { Store } from "./db.ts";
import { Scanner, BusyError } from "./scanner.ts";
import { settingsSchema, statuses, type Opportunity } from "./model.ts";
export const filterSchema = z.object({
  q: z.string().max(200).default(""),
  score: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(statuses).optional(),
  category: z.string().max(100).optional(),
  source: z.enum(["ted", "bekanntmachung"]).optional(),
  saved: z.enum(["true", "false"]).optional(),
  since: z.iso.date().optional(),
  distance: z.coerce.number().min(1).max(500).optional(),
  region: z.enum(["all", "target", "unknown"]).default("all"),
  active: z.enum(["true"]).optional(),
});
export function calendarDay(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
export function filter(items: Opportunity[], q: z.infer<typeof filterSchema>) {
  return items.filter(
    (o) =>
      (
        o.title +
        " " +
        o.description +
        " " +
        o.buyer +
        " " +
        o.locations.join(" ")
      )
        .toLocaleLowerCase("de")
        .includes(q.q.toLocaleLowerCase("de")) &&
      o.assessment.score >= q.score &&
      (!q.status || o.status === q.status) &&
      (!q.source || o.source === q.source) &&
      (!q.category || o.assessment.category === q.category) &&
      (!q.saved || o.saved === (q.saved === "true")) &&
      (!q.since || (!!o.published && calendarDay(o.published) >= q.since)) &&
      (!q.distance ||
        (o.assessment.distance !== null &&
          o.assessment.distance <= q.distance)) &&
      (q.region === "all" ||
        (q.region === "target"
          ? o.assessment.regionMatch
          : !o.assessment.regionMatch)) &&
      (!q.active || o.assessment.active === true),
  );
}
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function csv(items: Opportunity[]) {
  return (
    "\uFEFF" +
    [
      [
        "Titel",
        "Auftraggeber",
        "Ort",
        "Kategorie",
        "Veröffentlicht",
        "Fristen (UTC, Uhrzeit prüfen)",
        "Wert",
        "Währung",
        "Score",
        "Status",
        "Quelle",
        "Datenart",
        "URL",
        "Fehlende Informationen",
      ],
      ...items.map((o) => [
        o.title,
        o.buyer,
        o.locations.join(" · "),
        o.assessment.category,
        o.published,
        o.deadlines.join(" · "),
        o.value,
        o.currency,
        o.assessment.score,
        o.status,
        o.source,
        o.dataKind,
        o.url,
        o.assessment.unknown.join(" · "),
      ]),
    ]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n")
  );
}
export function createApp(
  store: Store,
  scanner: Scanner,
  token: string,
  staticDir?: string,
  marketMonitor = new MarketMonitor(store),
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/health", (_req, res) => {
    store.db.prepare("SELECT 1").get();
    res.json({ ok: true });
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const digest = (s: string) => createHash("sha256").update(s).digest();
    if (!token || !timingSafeEqual(digest(supplied), digest(token))) {
      res.status(401).json({ error: "Zugriffsschlüssel erforderlich" });
      return;
    }
    next();
  });
  app.get("/api/overview", (_req, res) => {
    const items = store.list();
    const runs = store.runs();
    res.json({
      total: items.length,
      new: items.filter((o) => o.status === "NEU").length,
      high: items.filter((o) => o.assessment.score >= 75).length,
      active: items.filter((o) => o.assessment.active === true).length,
      soon: items.filter(
        (o) =>
          o.assessment.active &&
          o.deadlines.some((d) => Date.parse(d) - Date.now() < 7 * 86400000),
      ).length,
      saved: items.filter((o) => o.saved).length,
      sources: store.sources(),
      runs,
      settings: store.settings(),
      scheduler:
        process.env.EXTERNAL_SCANS_ACTIVE === "true" ||
        (process.env.SCANS_ENABLED !== "false" &&
          !process.env.RAILWAY_ENVIRONMENT_ID),
      automationNote:
        process.env.EXTERNAL_SCANS_ACTIVE === "true"
          ? "Alle 4 Stunden · externer Zeitplan"
          : process.env.SCANS_ENABLED === "false"
            ? "Server-Scheduler deaktiviert"
            : process.env.RAILWAY_ENVIRONMENT_ID
              ? "Schlafmodus · Zeitplanfreigabe ausstehend"
              : "Alle 4 Stunden · serverseitig",
    });
  });
  app.get("/api/markets", (req, res) => {
    const scope = z
      .enum(["all", "regional"])
      .default("all")
      .parse(req.query.scope);
    res.json({
      markets: marketOverview(store, new Date(), scope === "regional"),
      scope,
      watchlist: stocks(store),
      updatedAt: new Date().toISOString(),
    });
  });
  app.post(
    "/api/markets/refresh",
    rateLimit({ windowMs: 60000, limit: 2 }),
    async (_req, res) => {
      try {
        res.json({ results: await marketMonitor.refresh() });
      } catch (e) {
        res.status(409).json({
          error: e instanceof Error ? e.message : "Marktabruf fehlgeschlagen",
        });
      }
    },
  );
  app.put("/api/markets/watchlist", (req, res) => {
    setStocks(store, req.body);
    res.json({ watchlist: stocks(store) });
  });
  app.post("/api/markets/evidence", (req, res) => {
    const v = evidenceSchema.parse(req.body);
    if (!marketDefinitions(store).some((m) => m.id === v.marketId)) {
      res.status(400).json({ error: "Markt nicht konfiguriert" });
      return;
    }
    const result = store.db
      .prepare(
        "INSERT INTO MarketEvidence(marketId,title,url,eventDate,kind,note,createdAt) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        v.marketId,
        v.title,
        v.url,
        v.eventDate,
        v.kind,
        v.note,
        new Date().toISOString(),
      );
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });
  app.delete("/api/markets/evidence/:id", (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const result = store.db
      .prepare("DELETE FROM MarketEvidence WHERE id=?")
      .run(id);
    res
      .status(result.changes ? 200 : 404)
      .json(
        result.changes
          ? { ok: true }
          : { error: "Quellenhinweis nicht gefunden" },
      );
  });
  app.get("/api/opportunities", (req, res) =>
    res.json(filter(store.list(), filterSchema.parse(req.query))),
  );
  app.get("/api/export", (req, res) =>
    res
      .type("text/csv")
      .attachment("opportunity-os.csv")
      .send(csv(filter(store.list(), filterSchema.parse(req.query)))),
  );
  app.get("/api/opportunities/:id", (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const item = store.list().find((o) => o.id === id);
    if (!item) {
      res.status(404).json({ error: "Chance nicht gefunden" });
      return;
    }
    res.json({ ...item, notes: store.notes(id), history: store.history(id) });
  });
  app.patch("/api/opportunities/:id", (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const patch = z
      .object({
        status: z.enum(statuses).optional(),
        saved: z.boolean().optional(),
      })
      .strict()
      .refine((x) => Object.keys(x).length > 0)
      .parse(req.body);
    if (!store.update(id, patch)) {
      res.status(404).json({ error: "Chance nicht gefunden" });
      return;
    }
    res.json({ ok: true });
  });
  app.post("/api/opportunities/:id/notes", (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { body } = z
      .object({ body: z.string().trim().min(1).max(10000) })
      .strict()
      .parse(req.body);
    if (!store.db.prepare("SELECT id FROM Opportunities WHERE id=?").get(id)) {
      res.status(404).json({ error: "Chance nicht gefunden" });
      return;
    }
    store.addNote(id, body);
    res.status(201).json({ ok: true });
  });
  app.put("/api/settings", (req, res) => {
    const s = settingsSchema.parse(req.body);
    store.setSettings(s);
    res.json(s);
  });
  app.post(
    "/api/scan",
    rateLimit({ windowMs: 60000, limit: 2 }),
    async (_req, res) => {
      try {
        res.json(await scanner.scan());
      } catch (e) {
        res.status(e instanceof BusyError ? 409 : 502).json({
          error: e instanceof Error ? e.message : "Scan fehlgeschlagen",
        });
      }
    },
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpunkt nicht gefunden" }),
  );
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get("/{*path}", (_req, res) => res.sendFile(staticDir + "/index.html"));
  }
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof SyntaxError && "body" in error) {
        res.status(400).json({ error: "Ungültiges JSON" });
        return;
      }
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Ungültige Eingabe", details: error.issues });
        return;
      }
      console.error("api_error", error.message);
      res
        .status(500)
        .json({ error: "Interner Fehler. Serverprotokoll prüfen." });
    },
  );
  return app;
}
