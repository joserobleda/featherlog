# REST API

Featherlog has a JSON REST API for scripts, CI pipelines and integrations: create and translate posts, publish, upload images, manage categories and widget settings.

- **Base URL:** `<APP_URL>/api/v1`
- **Interactive reference:** `<APP_URL>/api/docs`
- **OpenAPI 3.1 document:** `<APP_URL>/api/v1/openapi.json` (no auth needed). Use it to generate clients.

The MCP server ([mcp.md](mcp.md)) exposes the same operations to AI agents. Both call the same domain code, so permissions and validation behave identically.

## Authentication

Create a key in **Settings → API & MCP → API keys** (owners and admins). Send it as a bearer token:

```
Authorization: Bearer fl_live_…
```

A key belongs to **one workspace** and acts on behalf of the workspace, not a person. The secret is shown once and stored only as a hash. Keys can have an expiry date and can be revoked at any time. Posts created with a key show the key's name as their origin.

### Scopes

| Scope | Allows |
| --- | --- |
| `posts:read` | List and read posts. |
| `posts:write` | Create, edit and delete posts and translations. |
| `posts:publish` | Publish, schedule and unpublish (see [Integrations can publish](#integrations-can-publish)). |
| `categories:write` | Create, edit and delete categories. |
| `assets:write` | Upload images. |
| `settings:write` | Update workspace and widget settings. |
| `members:admin` | Invite members. |

Reading the workspace, locales, categories, widget settings and members only needs a valid key. A missing scope returns `403`.

### Integrations can publish

Each workspace has a switch, **Settings → API & MCP → Integrations can publish**. It is **off by default**. While it is off, API keys and MCP clients can only work with drafts. Publishing, scheduling, unpublishing, and editing or deleting a post that is already published or scheduled all return `403`. A person publishes from the dashboard. Turn it on to let keys with `posts:publish` go all the way. This setting can only be changed in the dashboard.

## Conventions

### Requests and responses

- JSON in and out (`Content-Type: application/json`). Dates are ISO 8601 strings, for example `2026-10-05T09:00:00Z`.
- Endpoints that take `{id}` accept either the post `id` or its short `publicId`.
- Posts carry a `translations` object keyed by locale (`en`, `es`…). Each translation has `title`, `slug`, `contentMd` ([Markdown](markdown.md)), `contentHtml`, `excerpt` and `url`. `url` is the public link once the post is published.
- `status` is `draft`, `scheduled` (published with a future `publishedAt`) or `published`.
- A locale must be enabled in the workspace before you can write a translation for it (`GET /api/v1/locales`).

### Idempotency

`POST /posts`, `POST /posts/{id}/publish`, `POST /posts/{id}/schedule` and `POST /categories` accept an `Idempotency-Key` header. If you retry with the same key and the same body, you get the original response back (with `Idempotent-Replayed: true`) instead of a second post. Reusing a key with a different body returns `422`. Idempotency keys are scoped to your API key and kept for at least 24 hours.

```sh
-H "Idempotency-Key: $(uuidgen)"
```

### Concurrency: ETag and If-Match

Every post has a `version` that increases on each change. `GET`, `PATCH` and `PUT …/translations/{locale}` return it as an `ETag` (`W/"<id>-v<version>"`). Send it back in `If-Match` on writes. If someone changed the post in the meantime, you get `412 Precondition Failed` instead of overwriting their edit:

```sh
-H 'If-Match: W/"k3j9x0q2m8w1v7c5b4n6-v4"'
```

`If-Match` also accepts the bare version number (`If-Match: 4`). It is optional on `PATCH`, `DELETE`, translations, publish, schedule and unpublish.

### Errors

Errors use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json`:

```json
{
  "type": "https://featherlog.dev/errors/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "Publishing from integrations is disabled for this workspace. A workspace admin can enable it in Settings → API.",
  "code": "forbidden"
}
```

| Status | `code` | When |
| --- | --- | --- |
| 401 | `unauthorized` | Missing, invalid, expired or revoked key. |
| 403 | `forbidden` | Missing scope, or publishing disabled for integrations. |
| 404 | `not_found` | Unknown post, category or endpoint. |
| 409 | `conflict` | Conflicting state. |
| 412 | `precondition_failed` | `If-Match` doesn't match the current version. `details.currentVersion` has the current one. |
| 422 | `validation` | Invalid body. `errors[]` lists `{ path, message }` for schema errors. |
| 429 | `rate_limited` | Too many requests. |

### Rate limits

**120 requests per minute per API key** (fixed window). Every response includes `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds until the window resets). The counter is kept in memory per server process.

### Pagination

`GET /posts` returns `{ "items": [...], "nextCursor": "…" | null }`, newest first. Pass `cursor=<nextCursor>` to get the next page. `limit` ranges from 1 to 100 (default 20).

### CORS

The API allows any origin, but **never put an API key in browser code**. For public data in the browser, use the widget's [headless JSON endpoint](widget.md#headless-json-endpoint).

## Endpoints

| Method | Path | Scope | Description |
| --- | --- | --- | --- |
| GET | `/workspace` | — | Workspace settings (including `publicId`, the widget account id). |
| PATCH | `/workspace` | `settings:write` | Update name, accent color, languages, visibility… |
| GET | `/locales` | — | Default, enabled and supported locales. |
| GET | `/posts` | `posts:read` | List posts. Filters: `status`, `locale`, `missingLocale`, `categoryId`, `q`, `cursor`, `limit`. |
| POST | `/posts` | `posts:write` | Create a post (a draft unless `publish: true`). |
| GET | `/posts/{id}` | `posts:read` | Get a post. |
| PATCH | `/posts/{id}` | `posts:write` | Partial update. A translation set to `null` is removed. |
| DELETE | `/posts/{id}` | `posts:write` | Delete a post. |
| PUT | `/posts/{id}/translations/{locale}` | `posts:write` | Create or replace one translation. |
| DELETE | `/posts/{id}/translations/{locale}` | `posts:write` | Remove one translation. |
| POST | `/posts/{id}/publish` | `posts:publish` | Publish now, or at `at` (body is optional). |
| POST | `/posts/{id}/schedule` | `posts:publish` | Publish at a future `publishAt`. |
| POST | `/posts/{id}/unpublish` | `posts:publish` | Back to draft. |
| POST | `/preview` | — | Render Markdown exactly like the public page. |
| GET | `/categories` | — | List categories. |
| POST | `/categories` | `categories:write` | Create (`color`, `names` per locale). |
| PATCH | `/categories/{categoryId}` | `categories:write` | Update. |
| DELETE | `/categories/{categoryId}` | `categories:write` | Delete. |
| POST | `/assets` | `assets:write` | Upload an image (multipart `file`, or JSON `{ "url" }`). |
| GET | `/widget-settings` | — | Widget settings and the embed snippet. |
| PATCH | `/widget-settings` | `settings:write` | Update widget settings. |
| GET | `/members` | — | List members. |
| POST | `/invitations` | `members:admin` | Invite someone by email. |

The interactive reference at `/api/docs` has the full request and response schemas.

## Examples

```sh
export FL=https://changelog.example.com/api/v1
export KEY=fl_live_…
```

### Create a draft

```sh
curl -X POST "$FL/posts" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "translations": {
      "en": {
        "title": "Dark mode",
        "contentMd": "[New]\n\nSwitch between light and dark themes from your profile."
      }
    }
  }'
```

The response is `201` with the post. Keep its `id` and `version`.

### Add a translation

```sh
curl -X PUT "$FL/posts/$POST_ID/translations/es" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H 'If-Match: W/"'"$POST_ID"'-v1"' \
  -d '{
    "title": "Modo oscuro",
    "contentMd": "[Nuevo]\n\nCambia entre tema claro y oscuro desde tu perfil."
  }'
```

### Publish

This requires `posts:publish` and **Integrations can publish**.

```sh
# now
curl -X POST "$FL/posts/$POST_ID/publish" \
  -H "Authorization: Bearer $KEY" \
  -H "Idempotency-Key: $(uuidgen)"

# or schedule it
curl -X POST "$FL/posts/$POST_ID/schedule" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{ "publishAt": "2026-10-12T09:00:00+02:00" }'
```

You can also create and publish in one call with `"publish": true` in `POST /posts`. If `publishedAt` is in the future, the post is scheduled.

### Upload an image from a URL

```sh
curl -X POST "$FL/assets" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com/screenshot.png" }'
# → { "id": "…", "url": "https://…/images/….webp", "width": 1600, "height": 900, "mime": "image/webp" }
```

Or upload a local file:

```sh
curl -X POST "$FL/assets" \
  -H "Authorization: Bearer $KEY" \
  -F "file=@screenshot.png"
```

PNG, JPEG, WebP, GIF and AVIF are accepted, up to 10 MB. Images are converted to WebP, except animated GIFs. URL imports only fetch public `http(s)` addresses: private and loopback networks and redirects are refused. Use the returned URL in Markdown: `![Screenshot](https://…)`.

### List posts

```sh
# published posts, 50 per page
curl "$FL/posts?status=published&limit=50" -H "Authorization: Bearer $KEY"

# next page
curl "$FL/posts?status=published&limit=50&cursor=$NEXT_CURSOR" -H "Authorization: Bearer $KEY"

# posts still missing a Spanish translation
curl "$FL/posts?missingLocale=es" -H "Authorization: Bearer $KEY"
```

### From GitHub Actions

```yaml
- name: Draft changelog post
  run: |
    curl -fsS -X POST "${{ vars.FEATHERLOG_URL }}/api/v1/posts" \
      -H "Authorization: Bearer ${{ secrets.FEATHERLOG_API_KEY }}" \
      -H "Content-Type: application/json" \
      -H "Idempotency-Key: release-${{ github.ref_name }}" \
      -d "$(jq -n --arg t "Release ${{ github.ref_name }}" --arg b "$BODY" \
            '{translations: {en: {title: $t, contentMd: $b}}}')"
```
