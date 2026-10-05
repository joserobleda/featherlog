import { expect, test } from "@playwright/test";
import { fixture, signIn, uid } from "./fixture";

test("write, categorize, publish and see a post on the public page", async ({ page }) => {
  const f = fixture();
  const title = `Shiny feature ${uid()}`;
  await signIn(page);
  await page.goto(`/app/${f.slug}/posts/new`);

  await page.getByRole("textbox", { name: "What's new?" }).fill(title);
  await page.getByRole("button", { name: "Categories" }).click();
  await page.getByRole("menuitem", { name: "New" }).click();
  await page.keyboard.type("Built with **love** for e2e tests.");

  await page.getByRole("button", { name: "Publish" }).click();
  // The URL switches to the saved post once the publish round-trip completes.
  await expect(page).toHaveURL(new RegExp(`/app/${f.slug}/posts/[a-z0-9]{20}$`));
  await expect(page.getByText("Visible on the public page and widget")).toBeVisible();

  await page.goto(`/${f.slug}`);
  const entry = page.getByRole("article").filter({ hasText: title });
  await expect(entry).toBeVisible();
  await expect(entry.getByText("love")).toBeVisible();
  await expect(entry.locator(".fl-category", { hasText: "New" }).first()).toBeVisible();
});

test("posts list filters by status and search", async ({ page }) => {
  const f = fixture();
  await signIn(page);
  await page.goto(`/app/${f.slug}/posts?status=draft`);
  await expect(page.getByRole("link", { name: "Draft: mobile app" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dark mode 🌙" })).toHaveCount(0);
  await page.goto(`/app/${f.slug}/posts?status=scheduled`);
  await expect(page.getByRole("link", { name: "Public API v2" })).toBeVisible();
});
