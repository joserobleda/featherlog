import { expect, test } from "@playwright/test";
import { latestEmailLink, uid } from "./fixture";

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
