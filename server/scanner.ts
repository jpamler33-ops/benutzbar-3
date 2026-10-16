import { captureCoverage } from "./markets.ts";
import { GermanAdapter } from "./german.ts";
import type { Notice, Settings } from "./model.ts";
import { randomUUID } from "node:crypto";
import { Store, utc } from "./db.ts";
import { TedAdapter, buildQuery, type SourceAdapter } from "./ted.ts";
export class BusyError extends Error {}
interface ScanResult {
  id: number;
  source: string;
  found: number;
  inserted: number;
  changed: number;
}
export class Scanner {
  private adapters: SourceAdapter[];
  constructor(
    private store: Store,
    adapter?: SourceAdapter,
  ) {
    this.adapters = adapter
      ? [adapter]
      : [new TedAdapter(), new GermanAdapter(store)];
  }
  private async run(
    adapter: SourceAdapter,
    s: Settings,
    owner: string,
  ): Promise<ScanResult> {
    const id = Number(
      this.store.db
        .prepare(
          "INSERT INTO ScanRuns(source,startedAt,state,query) VALUES(?,?,'RUNNING',?)",
        )
        .run(
          adapter.id,
          utc(),
          adapter.id === "ted"
            ? buildQuery(s)
            : "Offizielle OCDS-Tagesarchive · letzte 7 Tage · inkrementell",
        ).lastInsertRowid,
    );
    const members: Notice[] = [];
    let found = 0,
      inserted = 0,
      changed = 0;
    try {
      for await (const notices of adapter.search(s)) {
        this.store.renew(owner);
        for (const n of notices) {
          members.push(n);
          found++;
          const state = this.store.upsert(n);
          if (state === "inserted") inserted++;
          if (state === "changed") changed++;
        }
        this.store.db
          .prepare(
            "UPDATE ScanRuns SET found=?,inserted=?,changed=? WHERE id=?",
          )
          .run(found, inserted, changed, id);
      }
      this.store.db
        .prepare("UPDATE ScanRuns SET finishedAt=?,state='SUCCESS' WHERE id=?")
        .run(utc(), id);
      if (adapter.id === "ted") captureCoverage(this.store, id, members, s);
      this.store.db
        .prepare(
          "UPDATE Sources SET state='LIVE-DATEN',lastSuccess=?,lastError=NULL WHERE id=?",
        )
        .run(utc(), adapter.id);
      console.info(
        JSON.stringify({
          event: "scan_success",
          id,
          source: adapter.id,
          found,
          inserted,
          changed,
        }),
      );
      return { id, source: adapter.id, found, inserted, changed };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.store.db
        .prepare(
          "UPDATE ScanRuns SET finishedAt=?,state='FEHLER',error=? WHERE id=?",
        )
        .run(utc(), error, id);
      this.store.db
        .prepare("UPDATE Sources SET state='FEHLER',lastError=? WHERE id=?")
        .run(error, adapter.id);
      console.error(
        JSON.stringify({ event: "scan_error", id, source: adapter.id, error }),
      );
      throw e;
    }
  }
  async scan() {
    const owner = randomUUID();
    if (!this.store.acquire(owner))
      throw new BusyError("Ein Scan läuft bereits");
    const settings = this.store.settings();
    this.store.db
      .prepare(
        "UPDATE ScanRuns SET state='FEHLER',finishedAt=?,error='Vorheriger Prozess unterbrochen; erneuter Scan gestartet' WHERE state='RUNNING'",
      )
      .run(utc());
    const heartbeat = setInterval(() => {
      try {
        this.store.renew(owner);
      } catch (e) {
        console.error("scan_lock", e);
      }
    }, 30000);
    const results: ScanResult[] = [],
      errors: { source: string; error: string }[] = [];
    try {
      for (const adapter of this.adapters) {
        try {
          results.push(await this.run(adapter, settings, owner));
        } catch (e) {
          errors.push({
            source: adapter.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      if (!results.length)
        throw new Error(errors.map((e) => e.error).join("; "));
      return {
        id: results[0].id,
        found: results.reduce((s, r) => s + r.found, 0),
        inserted: results.reduce((s, r) => s + r.inserted, 0),
        changed: results.reduce((s, r) => s + r.changed, 0),
        results,
        errors,
      };
    } finally {
      clearInterval(heartbeat);
      this.store.release(owner);
    }
  }
  due() {
    return this.adapters.some((a) => {
      const run = this.store.db
        .prepare(
          "SELECT startedAt,state FROM ScanRuns WHERE source=? ORDER BY id DESC LIMIT 1",
        )
        .get(a.id) as { startedAt: string; state: string } | undefined;
      return (
        !run ||
        run.state === "RUNNING" ||
        Date.now() - Date.parse(run.startedAt) >= 4 * 3600000
      );
    });
  }
  start() {
    const tick = () => {
      if (this.due())
        void this.scan().catch((e) => {
          if (!(e instanceof BusyError)) console.error("scheduler", e.message);
        });
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }
}
