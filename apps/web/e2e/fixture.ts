import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD, FIXTURE_FILE } from "./global-setup";

export type Fixture = {
  workspaceId: string;
  slug: string;
  publicId: string;
  userId: string;
  email: string;
  apiKey: string;
};

export const fixture = (): Fixture => JSON.parse(readFileSync(FIXTURE_FILE, "utf8"));

export async function signIn(page: Page, email = E2E_EMAIL, password = E2E_PASSWORD) {
  const res = await page.request.post("/api/auth/sign-in/email", { data: { email, password } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

export const uid = () => Math.random().toString(36).slice(2, 8);
