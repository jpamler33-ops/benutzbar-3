import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { unzipSync, strFromU8 } from "fflate";
import { createHash } from "node:crypto";
import type { Store } from "./db.ts";
import type { Notice, Settings } from "./model.ts";
import type { SourceAdapter } from "./ted.ts";
import { assess } from "./scoring.ts";
const optionalText = z.string().optional();
const classification = z.object({ scheme: optionalText, id: optionalText });
const period = z.object({ endDate: optionalText }).optional();
const tenderSchema = z
  .object({
    title: optionalText,
    description: optionalText,
    status: optionalText,
    eligibilityCriteria: optionalText,
    tenderPeriod: period,
    enquiryPeriod: period,
    value: z
      .object({
        amount: z.number().nonnegative().optional(),
        currency: optionalText,
      })
      .optional(),
    items: z
      .array(
        z.object({
          classification: classification.optional(),
          additionalClassifications: z.array(classification).optional(),
          deliveryAddress: z.object({ locality: optionalText }).optional(),
        }),
      )
      .optional(),
    lots: z
      .array(z.object({ description: optionalText, tenderPeriod: period }))
      .optional(),
  })
  .passthrough();
const packageSchema = z
  .object({
    uri: z.string().optional(),
    publishedDate: optionalText,
    releases: z.array(
      z
        .object({
          id: z
            .string()
            .regex(
              /^(?:\d{1,30}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
            ),
          date: z.string(),
          tag: z.array(z.string()).optional(),
          buyer: z.object({ name: optionalText }).optional(),
          tender: tenderSchema.optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export function parseOcds(raw: unknown): Notice[] {
  const p = packageSchema.parse(raw);
  return p.releases.flatMap((r) => {
    const t = r.tender;
    if (!t?.title) return [];
    const cpv = [
      ...new Set(
        (t.items ?? [])
          .flatMap((i) => [
            ...(i.classification ? [i.classification] : []),
            ...(i.additionalClassifications ?? []),
          ])
          .filter((c) => c.scheme === "CPV" && c.id)
          .map((c) => c.id!),
      ),
    ];
    const tags = r.tag ?? [];
    const ended =
      t.status === "cancelled" ||
      t.status === "complete" ||
      tags.some((tag) => /^(award|contract|tenderCancellation)/.test(tag));
    const deadlines = [
      t.tenderPeriod?.endDate,
      ...(t.lots ?? []).map((l) => l.tenderPeriod?.endDate),
    ]
      .filter((d): d is string => !!d && Number.isFinite(Date.parse(d)))
      .map((d) => new Date(d).toISOString());
    const published = p.publishedDate ?? r.date;
    if (!Number.isFinite(Date.parse(published)))
      throw new Error("OCDS: Veröffentlichungsdatum ungültig");
    return [
      {
        dataKind: "LIVE-DATEN" as const,
        source: "bekanntmachung",
        sourceId: r.id,
        title: t.title,
        buyer: r.buyer?.name ?? null,
        description:
          t.description ??
          (t.lots ?? [])
            .map((l) => l.description ?? "")
            .filter(Boolean)
            .join("\n\n"),
        requirements: t.eligibilityCriteria ?? null,
        locations: [
          ...new Set(
            (t.items ?? [])
              .map((i) => i.deliveryAddress?.locality)
              .filter((v): v is string => !!v),
          ),
        ],
        published: new Date(published).toISOString(),
        deadlines: [...new Set(deadlines)].sort(),
        value: t.value?.amount ?? null,
        currency: t.value?.currency ?? null,
        cpv,
        noticeType: ended
          ? "can-standard"
          : tags.some((tag) => /tender/.test(tag))
            ? "cn-standard"
            : null,
        sme: null,
        url: `https://oeffentlichevergabe.de/ui/de/search/details?noticeId=${r.id}`,
        raw: p,
      },
    ];
  });
}
export function parseArchive(bytes: Uint8Array): Notice[] {
  if (bytes.byteLength > 25 * 1024 * 1024)
    throw new Error("Vergabe-Archiv überschreitet 25 MB");
  let total = 0,
    files = 0;
  const archive = unzipSync(bytes, {
    filter(file) {
      if (
        ++files > 15000 ||
        file.originalSize > 3 * 1024 * 1024 ||
        (total += file.originalSize) > 150 * 1024 * 1024
      )
        throw new Error("Vergabe-ZIP überschreitet Sicherheitsgrenzen");
      if (
        file.name.includes("..") ||
        file.name.startsWith("/") ||
        file.name.includes("\\")
      )
        throw new Error("Unsicherer ZIP-Pfad");
      return file.name.endsWith(".json");
    },
  });
  const notices = new Map<string, Notice>();
  for (const [name, content] of Object.entries(archive).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )) {
    if (content.byteLength > 3 * 1024 * 1024)
      throw new Error("OCDS-Datei zu groß");
    for (const n of parseOcds(JSON.parse(strFromU8(content))))
      notices.set(n.sourceId, n);
  }
  return [...notices.values()];
}
const shift = (d: string, n: number) =>
  new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
export function latestExportDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (name: string) => parts.find((p) => p.type === name)!.value;
  return shift(`${value("year")}-${value("month")}-${value("day")}`, -1);
}
export class GermanAdapter implements SourceAdapter {
  id = "bekanntmachung";
  constructor(
    private store: Store,
    private fetcher: typeof fetch = fetch,
    private pause: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {
    this.store.db.exec(
      `CREATE TABLE IF NOT EXISTS ImportDays(source TEXT NOT NULL,day TEXT NOT NULL,profile TEXT NOT NULL,completedAt TEXT NOT NULL,PRIMARY KEY(source,day,profile));INSERT OR IGNORE INTO Migrations VALUES(6,strftime('%Y-%m-%dT%H:%M:%fZ','now'));UPDATE Sources SET name='Bekanntmachungsservice DE · offizieller Tagesexport' WHERE id='bekanntmachung';`,
    );
  }
  async bytes(date: string, format = "ocds.zip") {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.fetcher(
          `https://oeffentlichevergabe.de/api/notice-exports?pubDay=${date}&format=${format}`,
          {
            headers: {
              Accept: "application/vnd.bekanntmachungsservice.ocds.zip+zip",
            },
            signal: AbortSignal.timeout(45000),
          },
        );
        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && attempt < 2) {
            const h = res.headers.get("retry-after");
            const seconds = h ? Number(h) : NaN;
            const delay = Number.isFinite(seconds)
              ? seconds * 1000
              : h
                ? Date.parse(h) - Date.now()
                : 0;
            if (delay > 60000)
              throw new Error("Vergabe-Quellenlimit; später erneut versuchen");
            await this.pause(Math.max(1000 * 2 ** attempt, delay || 0));
            continue;
          }
          throw new Error(`Vergabe HTTP ${res.status}`);
        }
        const size = Number(res.headers.get("content-length") ?? 0);
        if (size > 25 * 1024 * 1024) throw new Error("Vergabe-Archiv zu groß");
        const reader = res.body?.getReader();
        if (!reader) throw new Error("Vergabe-Archiv fehlt");
        let total = 0;
        const chunks: Uint8Array[] = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > 25 * 1024 * 1024)
              throw new Error("Vergabe-Archiv zu groß");
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        const bytes = new Uint8Array(total);
        let at = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, at);
          at += chunk.length;
        }
        return bytes;
      } catch (e) {
        if (
          e instanceof Error &&
          /HTTP|zu groß|Quellenlimit|ZIP|OCDS/.test(e.message)
        )
          throw e;
        if (attempt === 2)
          throw new Error(
            `Vergabe Netzwerk/Archivfehler: ${e instanceof Error ? e.message : String(e)}`,
          );
        await this.pause(1000 * 2 ** attempt);
      }
    }
    throw new Error("Vergabe-Archiv nicht verfügbar");
  }
  async archive(date: string) {
    return parseArchive(await this.bytes(date));
  }
  async *search(settings: Settings) {
    const end = latestExportDay();
    const profile = createHash("sha256")
      .update("eforms-v1:" + JSON.stringify(settings.keywords))
      .digest("hex");
    const initial = shift(end, -Math.min(6, settings.lookbackDays - 1));
    const days: string[] = [];
    for (let d = initial; d <= end; d = shift(d, 1)) {
      if (
        d === end ||
        !this.store.db
          .prepare(
            "SELECT day FROM ImportDays WHERE source=? AND day=? AND profile=?",
          )
          .get(this.id, d, profile)
      )
        days.push(d);
    }
    for (const d of days) {
      const all = await this.archive(d);
      const relevant = all.filter(
        (n) =>
          assess(n, settings).components.find((c) => c.key === "industry")!
            .value! > 0,
      );
      const supplements = relevant.length
        ? parseEformsArchive(
            await this.bytes(d, "eforms.zip"),
            new Set(relevant.map((n) => n.sourceId)),
          )
        : new Map<string, Supplement>();
      const enriched = relevant.map((n) => {
        const extra = supplements.get(n.sourceId);
        return extra
          ? {
              ...n,
              deadlines: extra.deadlines.length ? extra.deadlines : n.deadlines,
              requirements: extra.requirements ?? n.requirements,
              sme: extra.sme,
              raw: {
                original: n.raw,
                eforms: {
                  ...extra,
                  source: `https://oeffentlichevergabe.de/api/notice-exports?pubDay=${d}&format=eforms.zip`,
                },
              },
            }
          : n;
      });
      yield enriched;
      this.store.db
        .prepare(
          "INSERT INTO ImportDays VALUES(?,?,?,?) ON CONFLICT(source,day,profile) DO UPDATE SET completedAt=excluded.completedAt",
        )
        .run(this.id, d, profile, new Date().toISOString());
      await this.pause(400);
    }
  }
}

interface Supplement {
  deadlines: string[];
  requirements: string | null;
  sme: boolean | null;
  sha256: string;
}
export function parseEforms(xml: string): Supplement {
  if (xml.length > 3000000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Unzulässiges eForms XML");
  const root = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: true,
    parseTagValue: false,
    processEntities: false,
  }).parse(xml);
  const deadlines: string[] = [],
    requirements: string[] = [];
  const sme: boolean[] = [];
  const collect = (v: unknown): string[] =>
    typeof v === "string"
      ? [v]
      : Array.isArray(v)
        ? v.flatMap(collect)
        : v && typeof v === "object"
          ? Object.entries(v).flatMap(([k, v]) =>
              k === "Description"
                ? collect(v)
                : typeof v === "object"
                  ? collect(v)
                  : [],
            )
          : [];
  function walk(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        /^(TenderSubmissionDeadlinePeriod|ParticipationRequestReceptionPeriod)$/.test(
          key,
        )
      ) {
        for (const p of Array.isArray(child) ? child : [child]) {
          const date = String(p?.EndDate ?? "").match(
            /^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2}|Z)?$/,
          );
          const time = String(p?.EndTime ?? "").match(
            /^(\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2}|Z)?$/,
          );
          if (date) {
            const iso =
              time && (time[2] || date[2])
                ? `${date[1]}T${time[1]}${time[2] ?? date[2]}`
                : `${date[1]}T00:00:00Z`;
            if (Number.isFinite(Date.parse(iso)))
              deadlines.push(new Date(iso).toISOString());
          }
        }
      }
      if (/TendererQualificationRequest|SelectionCriteria/.test(key))
        requirements.push(...collect(child));
      if (
        /SMESuitableIndicator|SMEParticipationIndicator/.test(key) &&
        ["true", "false"].includes(String(child))
      )
        sme.push(String(child) === "true");
      walk(child);
    }
  }
  walk(root);
  return {
    deadlines: [...new Set(deadlines)].sort(),
    requirements:
      [...new Set(requirements)].join("\n\n").slice(0, 120000) || null,
    sme: sme.length ? sme.some(Boolean) : null,
    sha256: createHash("sha256").update(xml).digest("hex"),
  };
}
export function parseEformsArchive(bytes: Uint8Array, ids: Set<string>) {
  if (bytes.length > 25 * 1024 * 1024) throw new Error("eForms-Archiv zu groß");
  let total = 0,
    files = 0;
  const archive = unzipSync(bytes, {
    filter(f) {
      if (
        ++files > 15000 ||
        f.originalSize > 3000000 ||
        (total += f.originalSize) > 150 * 1024 * 1024
      )
        throw new Error("eForms-ZIP überschreitet Sicherheitsgrenzen");
      if (
        f.name.includes("..") ||
        f.name.startsWith("/") ||
        f.name.includes("\\")
      )
        throw new Error("Unsicherer ZIP-Pfad");
      const id = f.name.replace(/-[^-]+\.xml$/, "");
      return f.name.endsWith(".xml") && ids.has(id);
    },
  });
  const result = new Map<string, Supplement>();
  for (const [name, content] of Object.entries(archive).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )) {
    result.set(
      name.replace(/-[^-]+\.xml$/, ""),
      parseEforms(strFromU8(content)),
    );
  }
  return result;
}
