import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  X,
  Plus,
  Info,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { MarketView, Point } from "../server/markets";
type Request = (path: string, options?: RequestInit) => Promise<any>;
const groups = [
  "Alle",
  "Dienstleistungen",
  "Produkte",
  "Branchen",
  "Aktien",
  "Krypto",
  "Devisen",
];
const fmt = (n: number | null, decimals = 2) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        maximumFractionDigits: decimals,
      }).format(n);
const date = (s: string | null) =>
  s
    ? new Date(s).toLocaleDateString("de-DE", { timeZone: "UTC" })
    : "Unbekannt";
function Chart({ points, name }: { points: Point[]; name: string }) {
  const [hover, setHover] = useState<Point | null>(null);
  if (!points.length)
    return (
      <div className="market-chart-empty">Noch keine historische Zeitreihe</div>
    );
  const values = points.map((p) => p.value),
    min = Math.min(...values),
    max = Math.max(...values),
    spread = max - min || 1;
  const firstTime = Date.parse(points[0].date),
    timeRange = Date.parse(points.at(-1)!.date) - firstTime;
  const coords = points
    .map(
      (p) =>
        `${timeRange === 0 ? 50 : ((Date.parse(p.date) - firstTime) / timeRange) * 100},${45 - ((p.value - min) / spread) * 40}`,
    )
    .join(" ");
  return (
    <div className="market-chart">
      <svg
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${name}: ${points.length} Datenpunkte von ${points[0].date} bis ${points.at(-1)!.date}. Minimum ${fmt(min)}, Maximum ${fmt(max)}.`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const target =
            firstTime +
            Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) *
              timeRange;
          setHover(
            points.reduce((a, b) =>
              Math.abs(Date.parse(b.date) - target) <
              Math.abs(Date.parse(a.date) - target)
                ? b
                : a,
            ),
          );
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line
          x1="0"
          x2="100"
          y1="45"
          y2="45"
          stroke="#263c48"
          strokeWidth=".4"
        />
        <polyline
          points={coords}
          stroke="#6cddb0"
          strokeWidth="1"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div>
        <span>
          {hover
            ? `${date(hover.date)}: ${fmt(hover.value)}`
            : date(points[0].date)}
        </span>
        <span>{hover ? "" : date(points.at(-1)!.date)}</span>
      </div>
      <small>
        Skala automatisch · {fmt(min)} bis {fmt(max)}
      </small>
    </div>
  );
}
export function Markets({ request }: { request: Request }) {
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [group, setGroup] = useState("Alle");
  const [direction, setDirection] = useState("Alle Signale");
  const [scope, setScope] = useState("all");
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [watchlist, setWatchlist] = useState("IBM");
  const [editingStocks, setEditingStocks] = useState(false);
  // request is supplied by the workspace; use the stable token-bound callback from App.
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await request("/markets?scope=" + scope, { signal });
        if (!signal?.aborted) {
          setMarkets(data.markets);
          setWatchlist(
            (data.watchlist ?? [])
              .map((s: { symbol: string }) => s.symbol)
              .join("\n"),
          );
          setError("");
        }
      } catch (e) {
        if (!signal?.aborted) setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [request, scope],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    const id = setInterval(() => void load(controller.signal), 60000);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!detail) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDetail(null);
        setAdding(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detail]);
  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      const r = await request("/markets/refresh", {
        method: "POST",
        body: "{}",
      });
      await load();
      const failed = r.results.filter((r: { ok: boolean }) => !r.ok);
      setMessage(
        failed.length
          ? `${failed.length} Quellenabrufe fehlgeschlagen. Vorhandene Daten bleiben erhalten; Fehler stehen an der jeweiligen Reihe.`
          : "Marktzeitreihen aktualisiert. TED-Entwicklung wird beim regulären TED-Scan aktualisiert.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = markets.find((m) => m.id === detail);
  const filtered = markets.filter(
    (m) =>
      (group === "Alle" || m.group === group) &&
      (direction === "Alle Signale" || m.trend.state === direction),
  );
  return (
    <>
      <section className="market-intro">
        <div className="eyebrow">
          <Activity size={13} /> MARKT-RADAR
        </div>
        <h2>Was steigt – und was wissen wir über das Warum?</h2>
        <p>
          Nachfrageindikatoren, Preise und Kurse getrennt betrachten. Jede
          Veränderung hat eine Berechnung; eine wirtschaftliche Ursache braucht
          zusätzliche Belege.
        </p>
        <div className="market-legend">
          <span>Gemessen: vergleichbare Zeiträume</span>
          <span>Quellenhinweise: selbst recherchiert</span>
          <span>Hypothesen: noch nicht belegt</span>
        </div>
      </section>
      <div className="market-controls">
        <div className="market-tabs" aria-label="Marktbereiche">
          {groups.map((g) => (
            <button
              key={g}
              className={group === g ? "active" : ""}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <button
          className="primary"
          onClick={() => void refresh()}
          disabled={busy}
        >
          <RefreshCw size={15} className={busy ? "spin" : ""} />
          {busy ? "Quellen werden geladen …" : "Marktdaten aktualisieren"}
        </button>
      </div>
      <div className="filters">
        <label>
          Signal
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option>Alle Signale</option>
            <option value="STEIGT">Steigt</option>
            <option value="FÄLLT">Fällt</option>
            <option value="STABIL">Stabil</option>
            <option value="ZU WENIG DATEN">Zu wenig Daten</option>
          </select>
        </label>
        <label>
          TED-Ausschnitt
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Deutschland · L&P-Suchprofil</option>
            <option value="regional">
              Regional · Zielradius des letzten Scans
            </option>
          </select>
        </label>
        <p className="market-filter-note">
          Öffentliche Vergaben: zwei volle 28-Tage-Fenster. Kurse: zwei
          siebentägige Fenster. Monatsindizes: drei Monate gegen drei Vormonate.
          Der aktuelle UTC-Tag wird ausgeschlossen.
        </p>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {loading && <p role="status">Marktanalyse wird geladen …</p>}
      {group === "Aktien" && (
        <section className="panel">
          <button
            className="secondary"
            onClick={() => setEditingStocks((v) => !v)}
          >
            Aktien-Watchlist bearbeiten
          </button>
          {editingStocks && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await request("/markets/watchlist", {
                    method: "PUT",
                    body: JSON.stringify(
                      watchlist
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((symbol) => ({
                          symbol: symbol.toUpperCase(),
                          name: symbol.toUpperCase(),
                        })),
                    ),
                  });
                  setEditingStocks(false);
                  await load();
                  setMessage(
                    "Watchlist gespeichert. Jetzt Marktdaten aktualisieren.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <label>
                Aktien-Symbole · eines pro Zeile (maximal 8)
                <textarea
                  aria-label="Aktien-Symbole"
                  rows={4}
                  value={watchlist}
                  onChange={(e) => setWatchlist(e.target.value)}
                />
              </label>
              <button className="primary">Watchlist speichern</button>
            </form>
          )}
          <p>
            US-Notierungen, historische Nasdaq-Schlusskurse in USD. Beispiele:
            IBM, AAPL, MSFT.
          </p>
        </section>
      )}
      <div className="market-grid">
        {filtered.map((m) => (
          <article className="panel market-card" key={m.id}>
            <div className="panel-top">
              <span className="category">{m.group}</span>
              <span className={"badge " + (m.state === "FEHLER" ? "bad" : "")}>
                {m.state}
              </span>
            </div>
            <h3>{m.name}</h3>
            <p className="market-metric">
              {m.metric}
              {m.scopeLabel && (
                <>
                  <br />
                  {m.scopeLabel}
                </>
              )}
            </p>
            <div
              className={
                "market-value " +
                (m.trend.state === "STEIGT"
                  ? "up"
                  : m.trend.state === "FÄLLT"
                    ? "down"
                    : "")
              }
            >
              <strong>
                {m.trend.percent === null
                  ? "—"
                  : `${m.trend.percent > 0 ? "+" : ""}${fmt(m.trend.percent)} %`}
              </strong>
              <span>
                {m.trend.state === "STEIGT" ? (
                  <TrendingUp size={17} />
                ) : m.trend.state === "FÄLLT" ? (
                  <TrendingDown size={17} />
                ) : (
                  <Info size={16} />
                )}{" "}
                {m.trend.state}
              </span>
            </div>
            <Chart points={m.trend.points} name={m.name} />
            <p className="market-explanation">{m.trend.explanation}</p>
            {m.error && <div className="notice">{m.error}</div>}
            <div className="market-bottom">
              <small>
                {m.source} · Stand {date(m.trend.asOf)}
                {m.lastSuccess ? ` · Abruf ${date(m.lastSuccess)}` : ""}
              </small>
              <button
                className="text-button"
                onClick={() => {
                  setDetail(m.id);
                  setAdding(false);
                }}
              >
                Warum & Belege <ArrowUpRight size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!loading && !filtered.length && (
        <div className="empty">
          <h3>Kein Markt für diese Auswahl</h3>
          <p>Andere Bereiche oder Signale auswählen.</p>
        </div>
      )}
      <div className="footnote">
        <Info size={15} />
        Ein steigender Kurs ist weder eine Prognose noch ein Nachweis wachsender
        Nachfrage. Die angebundenen Reihen decken ausgewählte Ausschnitte ab;
        fehlende Märkte werden ausdrücklich gezeigt.
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="detail market-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Markt und Ursachen"
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const nodes = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), a[href], input, select, textarea, summary",
                ),
              );
              const first = nodes[0],
                last = nodes.at(-1);
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Marktdetail schließen"
              onClick={() => setDetail(null)}
              autoFocus
            >
              <X />
            </button>
            <span className="eyebrow">
              {selected.group} · {selected.state}
            </span>
            <h2>{selected.name}</h2>
            <div className="notice">
              {selected.metric} ·{" "}
              {selected.unit || "Messgröße noch nicht angebunden"}
            </div>
            <Chart points={selected.trend.points} name={selected.name} />
            <h3>1. Was wurde gemessen?</h3>
            <p>{selected.trend.explanation}</p>
            <div className="detail-grid">
              <div>
                <small>Aktueller Vergleichszeitraum</small>
                <p>{selected.trend.currentPeriod || "Noch nicht verfügbar"}</p>
                <strong>
                  {fmt(
                    selected.trend.current,
                    selected.group === "Dienstleistungen" ? 0 : 4,
                  )}
                </strong>
              </div>
              <div>
                <small>Voriger Vergleichszeitraum</small>
                <p>{selected.trend.previousPeriod || "Noch nicht verfügbar"}</p>
                <strong>
                  {fmt(
                    selected.trend.previous,
                    selected.group === "Dienstleistungen" ? 0 : 4,
                  )}
                </strong>
              </div>
            </div>
            <h3>2. Warum bewegt sich dieser Markt?</h3>
            {(selected.why ?? []).map((why, i) => (
              <div className="market-evidence" key={i}>
                <span className="badge">
                  {why.kind === "HYPOTHESE"
                    ? "AUTOMATISCHE HYPOTHESE · UNBEWIESEN"
                    : why.kind === "MESSBEITRAG"
                      ? "GEMESSENER BEITRAG"
                      : why.kind}
                </span>
                <h4>{why.title}</h4>
                <p>{why.detail}</p>
                {why.sources.map((source) => (
                  <p key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title} <ExternalLink size={12} />
                    </a>
                    <small> · {date(source.date)}</small>
                  </p>
                ))}
              </div>
            ))}
            <p>
              <strong>
                Eine wirtschaftliche Ursache ist derzeit nicht belegt.
              </strong>{" "}
              Die Zeitreihe zeigt eine Bewegung. Auch eine zeitgleiche Nachricht
              allein beweist keine Kausalität.
            </p>
            {selected.context.length > 0 && (
              <>
                <h3>Zeitgleiche offizielle Veröffentlichungen</h3>
                <p>
                  Automatisch aus offiziellen Quellen · {selected.contextState}.
                  Dies sind Rechercheansätze aus dem gleichen Umfeld, keine
                  nachgewiesenen Kurstreiber. Inhalt und zeitliche Wirkung im
                  Original prüfen.
                </p>
                {selected.context.length ? (
                  selected.context.map((n) => (
                    <div className="market-evidence" key={n.url}>
                      <small>
                        {date(n.date)} · {n.source}
                      </small>
                      <h4>
                        <a href={n.url} target="_blank" rel="noreferrer">
                          {n.title} <ExternalLink size={12} />
                        </a>
                      </h4>
                      <span className="badge">
                        EREIGNIS VERÖFFENTLICHT · ZUSAMMENHANG OFFEN
                      </span>
                    </div>
                  ))
                ) : (
                  <p>
                    Noch keine zeitnahen offiziellen Veröffentlichungen
                    gespeichert.
                  </p>
                )}
              </>
            )}
            <h3>3. Quellenhinweise & Hypothesen</h3>
            <p>
              Hier sammelst du überprüfbare Meldungen mit Datum und
              Original-Link. Nutzerhinweise werden nicht automatisch verifiziert
              und nicht als bewiesene Ursache ausgegeben.
            </p>
            {selected.evidence.length ? (
              selected.evidence.map((e) => (
                <div className="market-evidence" key={e.id}>
                  <span className="badge">
                    {e.kind === "HYPOTHESE"
                      ? "HYPOTHESE · UNBELEGT"
                      : "QUELLENHINWEIS · UNGEPRÜFT"}
                  </span>
                  <h4>
                    <a href={e.url} target="_blank" rel="noreferrer">
                      {e.title} <ExternalLink size={12} />
                    </a>
                  </h4>
                  <small>Ereignisdatum {date(e.eventDate)}</small>
                  <p>{e.note}</p>
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        await request("/markets/evidence/" + e.id, {
                          method: "DELETE",
                        });
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Hinweis entfernen
                  </button>
                </div>
              ))
            ) : (
              <p className="notice">
                Noch keine erklärenden Quellen verknüpft. Es wird kein Grund für
                den Anstieg erfunden.
              </p>
            )}
            <button className="secondary" onClick={() => setAdding((a) => !a)}>
              <Plus size={15} />
              Quelle oder Hypothese ergänzen
            </button>
            {adding && (
              <EvidenceForm
                id={selected.id}
                request={request}
                done={async () => {
                  await load();
                  setAdding(false);
                }}
              />
            )}
            <h3>4. Nächster sinnvoller Prüfschritt</h3>
            <p>{selected.check}</p>
            <h3>Grenzen dieser Messung</h3>
            <p>{selected.limitation}</p>
            {selected.url && (
              <a
                className="secondary"
                href={selected.url}
                target="_blank"
                rel="noreferrer"
              >
                Originalquelle & Methodik <ExternalLink size={14} />
              </a>
            )}
            <h3>Historische Daten</h3>
            {selected.trend.points.length ? (
              <details>
                <summary>
                  {selected.trend.points.length} Datenpunkte anzeigen
                </summary>
                <div className="market-table">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Datum (UTC)</th>
                        <th scope="col">{selected.unit}</th>
                        <th scope="col">Quellenflag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.trend.points.map((p) => (
                        <tr key={p.date}>
                          <td>{p.date}</td>
                          <td>{fmt(p.value, 4)}</td>
                          <td>
                            {p.flag === "p" ? "Vorläufig (p)" : p.flag || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : (
              <p>Noch keine Messwerte.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function EvidenceForm({
  id,
  request,
  done,
}: {
  id: string;
  request: Request;
  done: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="market-evidence-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await request("/markets/evidence", {
            method: "POST",
            body: JSON.stringify({ marketId: id, ...Object.fromEntries(form) }),
          });
          await done();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Art
        <select name="kind">
          <option value="QUELLENHINWEIS">Quellenhinweis · ungeprüft</option>
          <option value="HYPOTHESE">Hypothese · unbewiesen</option>
        </select>
      </label>
      <label>
        Titel
        <input name="title" required minLength={3} maxLength={200} />
      </label>
      <label>
        Original-Link (HTTPS)
        <input
          name="url"
          type="url"
          required
          maxLength={2000}
          placeholder="https://…"
        />
      </label>
      <label>
        Ereignisdatum
        <input type="date" name="eventDate" required />
      </label>
      <label>
        Welche Aussage stützt die Quelle – und was bleibt offen?
        <textarea name="note" required minLength={5} maxLength={4000} />
      </label>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "Speichert …" : "Hinweis speichern"}
      </button>
    </form>
  );
}
