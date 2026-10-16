import { test, expect } from "@playwright/test";
import { Store } from "../../server/db.ts";
import { MarketMonitor } from "../../server/markets.ts";
test("market radar: sources, chart, explanations, hypothesis persistence and mobile layout", async ({
  page,
}, info) => {
  const db = new Store(process.env.OS_E2E_DB!);
  const today = new Date().toISOString().slice(0, 10);
  const points = Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.parse(today) - (14 - i) * 86400000)
      .toISOString()
      .slice(0, 10),
    value: i < 7 ? 100 : 120,
  }));
  new MarketMonitor(db).save("btc-eur", points);
  db.db
    .prepare("UPDATE MarketSeries SET state='TESTDATEN' WHERE id='btc-eur'")
    .run();
  db.close();
  await page.goto("/");
  await page
    .getByLabel("Persönlicher Zugriffsschlüssel")
    .fill("browser-test-token-at-least-24-chars");
  await page.getByRole("button", { name: /Workspace öffnen/ }).click();
  await page.getByRole("button", { name: "Markt-Radar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Was steigt – und was wissen wir über das Warum?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Krypto", exact: true }).click();
  const card = page.locator(".market-card").filter({
    has: page.getByRole("heading", { name: "Bitcoin / Euro", exact: true }),
  });
  await expect(card).toContainText("TESTDATEN");
  await expect(card).toContainText("+20 %");
  await card.getByRole("button", { name: "Warum & Belege" }).click();
  const dialog = page.getByRole("dialog", { name: "Markt und Ursachen" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Eine wirtschaftliche Ursache ist derzeit nicht belegt.", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Quelle oder Hypothese ergänzen" })
    .click();
  await dialog
    .getByRole("combobox", { name: "Art", exact: true })
    .selectOption("HYPOTHESE");
  await dialog
    .getByLabel("Titel", { exact: true })
    .fill("TESTDATEN · Hypothese " + info.project.name);
  await dialog
    .getByLabel("Original-Link (HTTPS)")
    .fill("https://www.ecb.europa.eu/");
  await dialog.getByLabel("Ereignisdatum").fill(today);
  await dialog
    .getByLabel("Welche Aussage stützt die Quelle – und was bleibt offen?")
    .fill("TESTDATEN · Dies ist keine belegte Ursache.");
  await dialog
    .getByRole("button", { name: "Hinweis speichern", exact: true })
    .click();
  await expect(
    dialog.getByText("HYPOTHESE · UNBELEGT", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", {
      name: "TESTDATEN · Hypothese " + info.project.name,
    }),
  ).toHaveAttribute("href", "https://www.ecb.europa.eu/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `docs/market-detail-${info.project.name}.png`,
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Marktdetail schließen" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Markt-Radar", exact: true }).click();
  await page.getByRole("button", { name: "Krypto", exact: true }).click();
  await page
    .locator(".market-card")
    .filter({
      has: page.getByRole("heading", { name: "Bitcoin / Euro", exact: true }),
    })
    .getByRole("button", { name: "Warum & Belege" })
    .click();
  await expect(
    page.getByRole("link", {
      name: "TESTDATEN · Hypothese " + info.project.name,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hinweis entfernen", exact: true })
    .click();
  await expect(
    page.getByText("HYPOTHESE · UNBELEGT", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Marktdetail schließen" }).click();
  await page.getByRole("button", { name: "Produkte", exact: true }).click();
  await expect(
    page.getByText("NICHT VERFÜGBAR", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Alle", exact: true }).click();
  await page.screenshot({
    path: `docs/markets-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("stock watchlist can be changed without exposing a provider key", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Persönlicher Zugriffsschlüssel")
    .fill("browser-test-token-at-least-24-chars");
  await page.getByRole("button", { name: /Workspace öffnen/ }).click();
  await page.getByRole("button", { name: "Markt-Radar", exact: true }).click();
  await page.getByRole("button", { name: "Aktien", exact: true }).click();
  await page
    .getByRole("button", { name: "Aktien-Watchlist bearbeiten" })
    .click();
  await page.getByLabel("Aktien-Symbole", { exact: true }).fill("IBM\nAAPL");
  await page
    .getByRole("button", { name: "Watchlist speichern", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "AAPL", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ALPHA_VANTAGE_API_KEY", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Aktien-Watchlist bearbeiten" })
    .click();
  await page.getByLabel("Aktien-Symbole", { exact: true }).fill("IBM");
  await page
    .getByRole("button", { name: "Watchlist speichern", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "AAPL", exact: true }),
  ).toHaveCount(0);
});
