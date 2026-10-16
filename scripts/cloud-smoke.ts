import { chromium, expect } from "@playwright/test";
const base =
  process.env.OPPORTUNITY_URL ??
  "https://opportunity-os-production-37e2.up.railway.app";
const token = process.env.OPPORTUNITY_ADMIN_TOKEN;
if (!token) throw new Error("OPPORTUNITY_ADMIN_TOKEN fehlt");
async function json(path: string) {
  const r = await fetch(base + path, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Cloud-API ${path}: HTTP ${r.status}`);
  return r.json();
}
const health = await fetch(base + "/api/health");
if (health.status !== 200) throw new Error("Healthcheck fehlgeschlagen");
const anonymous = await fetch(base + "/api/overview");
if (anonymous.status !== 401) throw new Error("Ungeschützte Cloud-API");
const overview = await json("/api/overview");
const markets = await json("/api/markets");
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      health: health.status,
      anonymous: anonymous.status,
      total: overview.total,
      sources: overview.sources,
      markets: markets.markets.map((m: { id: string; state: string }) => ({
        id: m.id,
        state: m.state,
      })),
    },
    null,
    2,
  ),
);
const browser = await chromium.launch();
try {
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Persönlicher Zugriffsschlüssel").fill(token);
    await page.getByRole("button", { name: /Workspace öffnen/ }).click();
    await expect(
      page.getByRole("heading", {
        name: "Chancen erkennen. Wachstum schaffen.",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Markt-Radar", exact: true })
      .click();
    await expect(page.locator(".market-card")).toHaveCount(10);
    await page.screenshot({
      path: `docs/cloud-markets-${name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Aktien", exact: true }).click();
    await page.getByRole("button", { name: "Warum & Belege" }).click();
    await expect(
      page.getByRole("heading", { name: "2. Warum bewegt sich dieser Markt?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("BEOBACHTUNG", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `docs/cloud-stock-${name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Marktdetail schließen" }).click();
    await page
      .getByRole("button", { name: "Opportunity Feed", exact: false })
      .click();
    await page.getByLabel("Quelle filtern").selectOption("bekanntmachung");
    await expect(page.locator(".opportunity").first()).toBeVisible();
    await page.screenshot({
      path: `docs/cloud-german-${name}.png`,
      fullPage: true,
    });
    if (errors.length) throw new Error(errors.join(";"));
    await page.close();
    console.log(
      name +
        ": Cloud-Login, Markt-Radar, Aktienerklärung und deutscher Feed erfolgreich",
    );
  }
} finally {
  await browser.close();
}
