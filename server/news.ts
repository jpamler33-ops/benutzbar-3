import { XMLParser } from "fast-xml-parser";
import type { News } from "./markets.ts";
export const newsFeeds = [
  {
    id: "ibm-news",
    url: "https://newsroom.ibm.com/announcements?pagetemplate=rss",
    hosts: ["newsroom.ibm.com"],
    name: "IBM · offizielle Unternehmensmeldungen",
  },
  {
    id: "eth-news",
    url: "https://blog.ethereum.org/feed.xml",
    hosts: ["blog.ethereum.org"],
    name: "Ethereum Foundation · offizieller Blog",
  },
];
export function parsePublicFeed(
  xml: string,
  allowed: string[],
  source: string,
): News[] {
  if (xml.length > 3000000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Unzulässiger Nachrichtenfeed");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    trimValues: true,
  }).parse(xml);
  const raw = parsed.rss?.channel?.item ?? parsed.feed?.entry ?? [];
  const rows = Array.isArray(raw) ? raw : [raw];
  const result: News[] = [];
  for (const row of rows.slice(0, 100)) {
    const rawLink = row.link;
    const link =
      typeof rawLink === "string"
        ? rawLink
        : Array.isArray(rawLink)
          ? rawLink.find(
              (l: Record<string, string>) => l["@_rel"] === "alternate",
            )?.["@_href"]
          : rawLink?.["@_href"];
    const title =
      typeof row.title === "string" ? row.title : row.title?.["#text"];
    const date = new Date(row.pubDate ?? row.published ?? row.updated);
    try {
      const url = new URL(link);
      if (
        url.protocol !== "https:" ||
        !allowed.includes(url.hostname) ||
        url.username ||
        url.password ||
        !title ||
        !Number.isFinite(date.getTime())
      )
        continue;
      result.push({
        url: url.toString(),
        title: String(title)
          .replace(/<[^>]+>/g, "")
          .replaceAll("&amp;", "&")
          .slice(0, 500),
        date: date.toISOString().slice(0, 10),
        source,
      });
    } catch {
      continue;
    }
  }
  if (!result.length) throw new Error("Keine gültigen offiziellen Meldungen");
  return result;
}
