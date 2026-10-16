import { chromium, expect } from "@playwright/test";
const token = process.env.ADMIN_TOKEN;
if (!token) throw new Error("ADMIN_TOKEN fehlt");
const response = await fetch("http://127.0.0.1:3000/api/markets", {
  headers: { Authorization: "Bearer " + token },
});
if (!response.ok) throw new Error("Markt-API nicht erreichbar");
const overview = await response.json();
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      markets: overview.markets.map(
        (m: {
          id: string;
          state: string;
          trend: { state: string; percent: number | null };
        }) => ({
          id: m.id,
          state: m.state,
          signal: m.trend.state,
          percent: m.trend.percent,
        }),
      ),
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
    await page.goto("http://127.0.0.1:3000");
    await page.getByLabel("Persönlicher Zugriffsschlüssel").fill(token);
    await page.getByRole("button", { name: /Workspace öffnen/ }).click();
    await page
      .getByRole("button", { name: "Markt-Radar", exact: true })
      .click();
    await expect(page.locator(".market-card")).toHaveCount(10);
    await page.screenshot({
      path: `docs/markets-live-${name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Devisen", exact: true }).click();
    await page.getByRole("button", { name: "Warum & Belege" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Zeitgleiche offizielle Veröffentlichungen",
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .getByText("EREIGNIS VERÖFFENTLICHT · ZUSAMMENHANG OFFEN")
        .first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `docs/market-context-live-${name}.png`,
      fullPage: true,
    });
    await page.close();
    if (errors.length) throw new Error(errors.join(";"));
    console.log(
      name + ": Live-Marktübersicht und offizieller Quellenkontext erfolgreich",
    );
  }
} finally {
  await browser.close();
}
