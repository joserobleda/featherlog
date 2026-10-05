import { expect, test } from "@playwright/test";
import { fixture } from "./fixture";

test("public changelog in the default locale and in Spanish", async ({ page }) => {
  const f = fixture();
  await page.goto(`/${f.slug}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Dark mode 🌙" })).toBeVisible();
  // Scheduled and draft posts are not public
  await expect(page.getByText("Public API v2")).toHaveCount(0);
  await expect(page.getByText("Draft: mobile app")).toHaveCount(0);

  await page.goto(`/${f.slug}/es`);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("link", { name: "Modo oscuro 🌙" })).toBeVisible();
  // English-only post falls back to English with a notice
  await expect(page.getByText("Two-factor authentication")).toBeVisible();
});

test("post detail, wrong slug redirect and category filter", async ({ page }) => {
  const f = fixture();
  await page.goto(`/${f.slug}`);
  await page.getByRole("link", { name: "Faster search" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${f.slug}/faster-search-[a-z0-9]{8}$`));
  const url = new URL(page.url());
  const publicId = url.pathname.split("-").pop()!;
  await page.goto(`/${f.slug}/whatever-${publicId}`);
  await expect(page).toHaveURL(new RegExp(`/${f.slug}/faster-search-${publicId}$`));

  await page.goto(`/${f.slug}?category=security`);
  await expect(page.getByRole("link", { name: "Two-factor authentication" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Faster search" })).toHaveCount(0);
});

test("RSS feeds are valid and localized", async ({ request }) => {
  const f = fixture();
  const en = await request.get(`/${f.slug}/rss`);
  expect(en.headers()["content-type"]).toContain("xml");
  const body = await en.text();
  expect(body).toContain("<rss");
  expect(body).toContain("Dark mode");
  const es = await (await request.get(`/${f.slug}/rss/es`)).text();
  expect(es).toContain("Modo oscuro");
});
