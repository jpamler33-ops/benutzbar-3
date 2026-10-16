import data from "./places.json" with { type: "json" };
const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLocaleLowerCase("de")
    .trim()
    .replace(/,.*$/, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ");
type Place = (typeof data.places)[number];
const ambiguous = new Set(data.ambiguousNames);
const byName = new Map<string, Place | null>();
for (const place of data.places) {
  for (const alias of new Set([place.name, ...place.aliases].map(norm))) {
    const old = byName.get(alias);
    byName.set(
      alias,
      old === undefined ? place : old?.id === place.id ? place : null,
    );
  }
}
export function locate(city: string) {
  const key = norm(city);
  return ambiguous.has(key) ? null : (byName.get(key) ?? null);
}
export const origin = locate("Schwarzenfeld")!;
export const geoProvenance = {
  source: data.source,
  license: data.license,
  retrievedAt: data.retrievedAt,
};
