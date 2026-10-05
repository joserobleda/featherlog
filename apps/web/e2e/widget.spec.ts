import { expect, type Page, test } from "@playwright/test";
import { fixture } from "./fixture";

// A different origin than the app (localhost:3100) but still loopback, so Chrome's Private
// Network Access rules don't block the widget script like they would for a public hostname.
const HOST = "http://127.0.0.1:3100/__customer-site";

/** Serves a fake customer website that embeds the widget with the given snippet. */
async function customerSite(page: Page, body: string) {
  await page.route(`${HOST}*`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><title>Customer</title></head><body>${body}</body></html>`,
    }),
  );
  await page.goto(HOST);
}

// The badge animation (eyecatcher) keeps the element "unstable" for clicks; the widget honours
// prefers-reduced-motion, which is what users who disable animations get too.
test.use({ reducedMotion: "reduce" });

const loader = (base: string) => `<script async src="${base}/widget.js"></script>`;

test("an unchanged Headway snippet shows the badge and the popover", async ({ page, baseURL }) => {
  const f = fixture();
  await customerSite(
    page,
    `<header><h1>Acme app <span class="whats-new"></span></h1></header>
     <script>var HW_config = { selector: ".whats-new", account: "${f.publicId}" };</script>${loader(baseURL!)}`,
  );
  const badge = page.locator("#HW_badge");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(/^[1-9]\d*$/);

  await badge.click();
  const frame = page.frameLocator("#HW_frame_cont iframe");
  await expect(page.locator("#HW_frame_cont")).toHaveClass(/HW_visible/);
  await expect(frame.getByText("Export fixes")).toBeVisible();
  await frame.getByText("Export fixes").click();
  await expect(frame.getByRole("link", { name: /read the full post/i })).toBeVisible();

  // Closing marks everything as seen: after a reload the counter is gone.
  await page.keyboard.press("Escape");
  await expect(page.locator("#HW_frame_cont")).not.toHaveClass(/HW_visible/);
  await page.reload();
  await expect(page.locator("#HW_badge")).not.toHaveText(/^[1-9]/, { timeout: 10_000 });
});

test("the widget speaks the page language and supports Headway.init in SPAs", async ({
  page,
  baseURL,
}) => {
  const f = fixture();
  await customerSite(
    page,
    `<div id="mount"><span class="badge-here"></span></div>${loader(baseURL!)}`,
  );
  await page.waitForFunction(() => "Headway" in window && "Featherlog" in window);
  await page.evaluate(
    ({ account }) =>
      (window as unknown as { Headway: { init(c: unknown): void } }).Headway.init({
        selector: ".badge-here",
        account,
        language: "es",
      }),
    { account: f.publicId },
  );
  await page.locator("#HW_badge").click();
  const frame = page.frameLocator("#HW_frame_cont iframe");
  await expect(frame.getByText("Modo oscuro 🌙")).toBeVisible();

  // Re-init destroys the previous instance (no duplicate badges).
  await page.evaluate(
    ({ account }) =>
      (window as unknown as { Featherlog: { init(c: unknown): void } }).Featherlog.init({
        selector: ".badge-here",
        account,
      }),
    { account: f.publicId },
  );
  await expect(page.locator("#HW_badge")).toHaveCount(1);
});

test("embed mode renders the list inline", async ({ page, baseURL }) => {
  const f = fixture();
  await customerSite(
    page,
    `<section id="updates" style="width:420px"></section>
     <script>var HW_config = { selector: "#updates", account: "${f.publicId}", embed: true };</script>${loader(baseURL!)}`,
  );
  const frame = page.frameLocator("#updates iframe");
  await expect(frame.getByText("Dark mode 🌙")).toBeVisible();
  await expect(page.locator("#HW_badge")).toHaveCount(0);
});

test("headless JSON endpoint with caching headers", async ({ request }) => {
  const f = fixture();
  const res = await request.get(`/api/widget/${f.publicId}?lang=es`);
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["access-control-allow-origin"]).toBe("*");
  const etag = res.headers().etag!;
  const json = await res.json();
  expect(json.items.length).toBeGreaterThan(0);
  const again = await request.get(`/api/widget/${f.publicId}?lang=es`, {
    headers: { "If-None-Match": etag },
  });
  expect(again.status()).toBe(304);
});
