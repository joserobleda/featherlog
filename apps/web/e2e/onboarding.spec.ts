import { expect, test } from "@playwright/test";
import { latestEmailLink, uid } from "./fixture";
import { E2E_EMAIL } from "./global-setup";

test("a new user signs up, creates a workspace and lands on an empty posts list", async ({
  page,
}) => {
  const id = uid();
  await page.goto("/signup");
  await page.getByLabel("Name").fill("New Person");
  const email = `new-${id}@featherlog.test`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-good-password");
  await page.getByRole("button", { name: "Create account" }).click();

  // Production builds with SMTP require email verification first.
  await expect(page).toHaveURL(/\/app\/new|\/verify/);
  if (page.url().includes("/verify")) await page.goto(await latestEmailLink(email, "verify"));
  await expect(page).toHaveURL(/\/app\/new/);
  await page.getByLabel("Product or company name").fill(`Startup ${id}`);
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page).toHaveURL(new RegExp(`/app/startup-${id}/posts`));
  await expect(page.getByText("No posts yet")).toBeVisible();
});

test("protected pages redirect to login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp/);
});

test("a sign-in link works once; reusing it explains why instead of looping to login", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const link = await latestEmailLink(E2E_EMAIL, "magic-link");

  const other = await browser.newContext();
  const second = await other.newPage();
  await page.goto(link);
  await expect(page).toHaveURL(/\/app/);
  await expect(page).not.toHaveURL(/\/login/);

  await second.goto(link);
  await expect(second).toHaveURL(/\/login\?.*error=/);
  await expect(second.getByText(/already used or has expired/)).toBeVisible();
  await other.close();
});
