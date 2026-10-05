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

/** Returns the first link in the latest email sent to `to` (Mailpit API, used when verification is on). */
export async function latestEmailLink(to: string, contains = "http") {
  const base = process.env.MAILPIT_URL ?? "http://localhost:8025";
  for (let i = 0; i < 20; i++) {
    const search = await fetch(
      `${base}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    ).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const msg = await fetch(`${base}/api/v1/message/${id}`).then((r) => r.json());
      const link = String(msg.Text ?? "")
        .match(/https?:\/\/\S+/g)
        ?.find((l: string) => l.includes(contains));
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email for ${to}`);
}
