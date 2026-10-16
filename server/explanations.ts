import type { Definition, Trend, News } from "./markets.ts";
export interface Explanation {
  kind: "BEOBACHTUNG" | "MESSBEITRAG" | "HYPOTHESE" | "DATENLÜCKE";
  title: string;
  detail: string;
  sources: { title: string; url: string; date: string }[];
}
export interface SnapshotMember {
  published: string;
  category: string;
  regional: boolean;
  buyer?: string | null;
  title?: string;
  url?: string;
}
const rules = [
  {
    re: /interest rate|monetary policy|zins|geldpolit|credit|financing|inflation|uncertainty/i,
    title: "Zins-, Kredit- oder Risikoumfeld",
    detail:
      "Die offizielle Veröffentlichung betrifft das finanzielle Umfeld. Veränderte Zins-, Kredit- oder Risikoerwartungen sind ein möglicher Übertragungskanal. Richtung und Anteil an dieser Marktbewegung sind nicht nachgewiesen.",
  },
  {
    re: /earnings|revenue|quarter|financial results|acqui|dividend|partnership|collaborat|IBM/i,
    title: "Unternehmensmeldungen und Geschäftserwartungen",
    detail:
      "Eine offizielle Unternehmensmeldung liegt im Vergleichsfenster. Änderungen erwarteter Erträge oder Risiken können den Kurs beeinflussen; ob diese Meldung den beobachteten Verlauf erklärt, muss anhand Inhalt und genauer Zeitfolge geprüft werden.",
  },
  {
    re: /upgrade|mainnet|protocol|fork|security|ethereum|fusaka|pectra|glamsterdam/i,
    title: "Netzwerk- und Protokollentwicklung",
    detail:
      "Eine offizielle Protokoll- oder Netzwerkmeldung ist zeitnah dokumentiert. Technische Änderungen können Erwartungen zu Nutzung, Kosten oder Risiken beeinflussen. Ein Einfluss auf den Ether-Kurs ist damit noch nicht belegt.",
  },
];
export function explainMarket(
  def: Definition,
  trend: Trend,
  context: News[],
  members: SnapshotMember[] = [],
): Explanation[] {
  const sources = def.url
    ? [{ title: def.source, url: def.url, date: trend.asOf ?? "" }]
    : [];
  const result: Explanation[] = [
    {
      kind: "BEOBACHTUNG",
      title: "So entsteht das gemessene Signal",
      detail: trend.explanation,
      sources,
    },
  ];
  if (trend.state === "ZU WENIG DATEN") {
    result.push({
      kind: "DATENLÜCKE",
      title: "Keine belastbare Trend-Erklärung",
      detail:
        "Ohne ausreichende vergleichbare Daten wird weder Wachstum noch ein wirtschaftlicher Grund behauptet.",
      sources: [],
    });
    return result;
  }
  if (
    def.group === "Dienstleistungen" &&
    trend.currentPeriod &&
    trend.previousPeriod
  ) {
    const [currentStart, currentEnd] = trend.currentPeriod.split(" – "),
      [priorStart, priorEnd] = trend.previousPeriod.split(" – ");
    const buyers = new Map<
      string,
      { current: SnapshotMember[]; previous: number }
    >();
    for (const n of members) {
      if (
        n.category !== def.name &&
        !(def.id === "ted-moving" && n.category === "Umzug & Transport")
      )
        continue;
      const name = n.buyer ?? "Auftraggeber nicht veröffentlicht";
      const b = buyers.get(name) ?? { current: [], previous: 0 };
      if (n.published >= currentStart && n.published <= currentEnd)
        b.current.push(n);
      if (n.published >= priorStart && n.published <= priorEnd) b.previous++;
      buyers.set(name, b);
    }
    const contributions = [...buyers]
      .filter(([, b]) =>
        trend.state === "FÄLLT"
          ? b.current.length < b.previous
          : b.current.length > b.previous,
      )
      .sort(
        (a, b) =>
          Math.abs(b[1].current.length - b[1].previous) -
          Math.abs(a[1].current.length - a[1].previous),
      )
      .slice(0, 3);
    for (const [name, b] of contributions) {
      const delta = b.current.length - b.previous;
      result.push({
        kind: "MESSBEITRAG",
        title: name,
        detail: `${b.current.length} statt ${b.previous} Veröffentlichungen im gleichen Suchausschnitt (${delta > 0 ? "+" : ""}${delta}). Das ist ein rechnerischer Beitrag zur Veränderung der beobachteten Anzahl, kein Nachweis höherer Gesamtnachfrage.`,
        sources: b.current
          .filter((n) => n.url)
          .slice(0, 2)
          .map((n) => ({
            title: n.title ?? "Originalbekanntmachung",
            url: n.url!,
            date: n.published,
          })),
      });
    }
  }
  const end = trend.asOf ?? "";
  const start = trend.previousPeriod.split(" – ")[0] ?? "";
  const candidates = context.filter((n) => n.date >= start && n.date <= end);
  for (const rule of rules) {
    const match = candidates.find(
      (n) =>
        rule.re.test(n.title) &&
        (rule.title === "Unternehmensmeldungen und Geschäftserwartungen"
          ? def.id === "stock-IBM"
          : rule.title === "Netzwerk- und Protokollentwicklung"
            ? def.id === "eth-eur"
            : def.group !== "Dienstleistungen"),
    );
    if (match)
      result.push({
        kind: "HYPOTHESE",
        title: rule.title,
        detail: rule.detail,
        sources: [{ title: match.title, url: match.url, date: match.date }],
      });
  }
  result.push({
    kind: "DATENLÜCKE",
    title: "Wirtschaftliche Kausalität bleibt offen",
    detail: result.some((r) => r.kind === "HYPOTHESE")
      ? "Die genannten Kanäle sind automatisch zugeordnete, quellenbasierte Hypothesen. Zeitliche Nähe allein beweist keine Ursache; Gegenargumente, andere Märkte und weitere Daten prüfen."
      : "Im verfügbaren Zeitfenster ist keine passende erklärende Ereignisquelle hinterlegt. Der Grund der wirtschaftlichen Bewegung bleibt unbekannt.",
    sources: [],
  });
  return result;
}
