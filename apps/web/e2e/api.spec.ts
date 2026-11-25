import { expect, test } from "@playwright/test";
import { fixture, signIn, uid } from "./fixture";

test("REST API: create a draft idempotently, conflicts and publish guard", async ({ request }) => {
  const f = fixture();
  const headers = { Authorization: `Bearer ${f.apiKey}` };
  const key = `idem-${uid()}`;
  const body = {
    translations: { en: { title: `From CI ${key}`, contentMd: "[Fix]\n\nAll good." } },
  };

  const first = await request.post("/api/v1/posts", {
    headers: { ...headers, "Idempotency-Key": key },
    data: body,
  });
  expect(first.status()).toBe(201);
  const post = await first.json();
  expect(post).toMatchObject({ status: "draft", createdVia: "api", actorLabel: "Demo key" });

  const replay = await request.post("/api/v1/posts", {
    headers: { ...headers, "Idempotency-Key": key },
    data: body,
  });
  expect(replay.headers()["idempotent-replayed"]).toBe("true");
  expect((await replay.json()).id).toBe(post.id);

  const got = await request.get(`/api/v1/posts/${post.id}`, { headers });
  const etag = got.headers().etag!;
  const ok = await request.patch(`/api/v1/posts/${post.id}`, {
    headers: { ...headers, "If-Match": etag },
    data: { translations: { es: { title: "Desde CI", contentMd: "[Corrección]\n\nTodo bien." } } },
  });
  expect(ok.status()).toBe(200);
  const stale = await request.patch(`/api/v1/posts/${post.id}`, {
    headers: { ...headers, "If-Match": etag },
    data: { publishedAt: null },
  });
  expect(stale.status()).toBe(412);
  expect(stale.headers()["content-type"]).toContain("application/problem+json");

  // Integrations cannot publish unless the workspace enables it (off by default): the post goes
  // to the review queue instead, with what's needed to tell the team.
  const publish = await request.post(`/api/v1/posts/${post.id}/publish`, { headers });
  expect(publish.status()).toBe(200);
  const queued = await publish.json();
  expect(queued).toMatchObject({ status: "in_review", published: false });
  expect(queued.review.requestedBy).toBe("Demo key");
  expect(queued.adminUrl).toMatch(new RegExp(`/app/${f.slug}/posts/${post.id}$`));
  expect(queued.pendingReviewCount).toBeGreaterThanOrEqual(1);
});

test("Review queue: an integration's post is approved from the dashboard", async ({ page }) => {
  const f = fixture();
  const headers = { Authorization: `Bearer ${f.apiKey}` };
  const title = `Needs review ${uid()}`;
  const created = await page.request.post("/api/v1/posts", {
    headers,
    // A future date, so the approved post doesn't push seeded posts out of the widget tests.
    data: {
      translations: { en: { title, contentMd: "Body." } },
      publishedAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      publish: true,
    },
  });
  const post = await created.json();
  expect(post.status).toBe("in_review");

  await signIn(page);
  await page.goto(`/app/${f.slug}/posts?status=in_review`);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByText("Waiting for review — sent by Demo key")).toBeVisible();
  await page.getByRole("button", { name: "Approve and schedule" }).first().click();
  await expect(page.getByText("Approved")).toBeVisible();

  await expect
    .poll(async () => {
      const r = await page.request.get(`/api/v1/posts/${post.id}`, { headers });
      return (await r.json()).status;
    })
    .toBe("scheduled");
  await page.goto(`/app/${f.slug}/posts?status=in_review`);
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("REST API: auth errors and OpenAPI document", async ({ request }) => {
  const noKey = await request.get("/api/v1/posts");
  expect(noKey.status()).toBe(401);
  const doc = await (await request.get("/api/v1/openapi.json")).json();
  expect(doc.openapi).toBe("3.1.0");
  expect(Object.keys(doc.paths)).toContain("/api/v1/posts/{id}/publish");
});

test("REST API: keep subscribers in sync by external id", async ({ request }) => {
  const f = fixture();
  const headers = { Authorization: `Bearer ${f.apiKey}` };
  const id = `user-${uid()}`;

  const created = await request.put(`/api/v1/subscribers/${id}`, {
    headers,
    data: { email: `${id}@Example.com`, name: "Ada", locale: "es-ES", attributes: { org: "Acme" } },
  });
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({
    externalId: id,
    email: `${id}@example.com`,
    locale: "es",
    status: "subscribed",
  });

  const moved = await request.put(`/api/v1/subscribers/${id}`, {
    headers,
    data: { email: `${id}@new.example.com`, unsubscribed: true },
  });
  expect(moved.status()).toBe(200);
  expect(await moved.json()).toMatchObject({ name: "Ada", status: "unsubscribed" });

  const resync = await request.post("/api/v1/subscribers/batch", {
    headers,
    data: { items: [{ externalId: id, email: `${id}@new.example.com`, unsubscribed: false }] },
  });
  expect(await resync.json()).toEqual({ created: 0, updated: 0, unchanged: 1 });
  const got = await request.get(`/api/v1/subscribers/${id}`, { headers });
  expect((await got.json()).status).toBe("unsubscribed");

  const list = await request.get(`/api/v1/subscribers?q=${id}`, { headers });
  expect((await list.json()).items).toHaveLength(1);

  expect((await request.delete(`/api/v1/subscribers/${id}`, { headers })).status()).toBe(204);
  expect((await request.get(`/api/v1/subscribers/${id}`, { headers })).status()).toBe(404);
});
