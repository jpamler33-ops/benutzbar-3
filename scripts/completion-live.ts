import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { Store } from "../server/db.ts";
import { Scanner } from "../server/scanner.ts";
import { GermanAdapter } from "../server/german.ts";
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  setGlobalDispatcher(new EnvHttpProxyAgent());
const s = new Store(process.env.DATABASE_PATH ?? "data/completion-live.sqlite");
try {
  const scanner = new Scanner(s, new GermanAdapter(s));
  const first = await scanner.scan();
  const count = s.list().length;
  const second = await scanner.scan();
  if (second.inserted || s.list().length !== count)
    throw new Error("Deutsche Duplikatprüfung fehlgeschlagen");
  const rows = s.list();
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        first,
        second,
        persisted: rows.length,
        deadlines: rows.filter((n) => n.deadlines.length).length,
        requirements: rows.filter((n) => n.requirements).length,
        regional: rows.filter((n) => n.assessment.regionMatch).length,
        sources: s.sources(),
      },
      null,
      2,
    ),
  );
} finally {
  s.close();
}
