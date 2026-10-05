import { expect, test } from "@playwright/test";
import { fixture, uid } from "./fixture";

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

  // Integrations cannot publish unless the workspace enables it (off by default).
  const publish = await request.post(`/api/v1/posts/${post.id}/publish`, { headers });
  expect(publish.status()).toBe(403);
});

test("REST API: auth errors and OpenAPI document", async ({ request }) => {
  const noKey = await request.get("/api/v1/posts");
  expect(noKey.status()).toBe(401);
  const doc = await (await request.get("/api/v1/openapi.json")).json();
  expect(doc.openapi).toBe("3.1.0");
  expect(Object.keys(doc.paths)).toContain("/api/v1/posts/{id}/publish");
});
