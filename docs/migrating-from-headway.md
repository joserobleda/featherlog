# Migrating from Headway

Featherlog's widget understands Headway's snippet format, so for most sites the switch takes a few minutes.


## Importing your posts

Featherlog can import every published entry from public Headway changelogs, including their
categories, publication dates and images (re-hosted on your Featherlog instance). If you ran one
Headway account per language, list them all: entries published on the same day are paired as
translations of a single post.

1. Create the workspace and enable the languages you need (Settings → Languages). Add the category
   names in each language (Settings → Categories) — Headway labels such as `[New]` are matched
   against them.
2. Preview the import (nothing is written):

   ```sh
   docker compose exec app featherlog import-headway --workspace acme \
     --source acme-changelog:en --source acme-es-updates:es --dry-run
   ```

   The first `--source` is the primary language. The report lists every post with its paired
   translations and flags the matches worth reviewing (same day with several entries, or a few days
   apart). Fix them with `--pair <id>:<id>` or `--unpair <id>` (ids are shown in the report).
3. Run it again without `--dry-run`. Re-running is safe: entries already imported are skipped, and a
   newly paired translation is added to the existing post.

From a repository checkout the same command is `pnpm --filter @featherlog/web import-headway …`.
Drafts and scheduled entries aren't public on Headway, so they aren't imported.

## 1. Create your workspace

Sign up on your Featherlog instance (or [self-host one](self-hosting.md)) and create a workspace. The workspace slug becomes your public changelog URL: `<PUBLIC_URL>/<slug>`.

## 2. Get your new account id

Your Headway account id **doesn't carry over**. Featherlog generates its own. Copy it from **Settings → Widget**, where the full snippet is ready to paste.

## 3. Update the snippet

Change two things in your existing Headway snippet:

```diff
 <script>
   var HW_config = {
     selector: ".headway-badge",
-    account: "7XYZab"
+    account: "YOUR_FEATHERLOG_ACCOUNT_ID"
   };
 </script>
-<script async src="https://cdn.headwayapp.co/widget.js"></script>
+<script async src="https://changelog.example.com/widget.js"></script>
```

The rest keeps working as it is:

- `HW_config` with `selector`, `trigger`, `position`, `enabled`, `embed`, `translations` (`title`, `readMore`, `footer`, `labels`) and `callbacks` (`onWidgetReady`, `onShowWidget`, `onShowDetails`, `onReadMore`, `onHideWidget`)
- `window.Headway.init()`, `.show()`, `.hide()`, `.toggle()`, `.destroy()`, `.getUnseenCount()`, `.markAllSeen()`
- CSS that targets `#HW_badge`, `#HW_badge_cont` and `.HW_softHidden`

Badge delay, posts shown, count expiry, soft hide and the eye-catcher animation are set in **Settings → Widget**, not in the snippet. See [widget.md](widget.md) for all options.

If your site sends a Content-Security-Policy, replace `headwayapp.co` with your Featherlog host in `script-src` and `frame-src` ([details](widget.md#content-security-policy-on-your-site)).

## 4. Recreate your categories

New workspaces start with **New**, **Improvement** and **Fix**, translated into every supported language. Add or rename categories in **Settings → Categories** to match the labels you used in Headway, such as "Announcement" or "Bug fix", and pick their colors.

In posts, label a post by writing the category in brackets on its own line:

```markdown
[New] [Improvement]

You can now export reports as CSV.
```

If you used `translations.labels` in your snippet to rename labels, translating the category names in Settings is usually the cleaner option.

## 5. One workspace for all your languages

With Headway, a changelog in several languages usually meant **one account per language** and some logic to choose the snippet. In Featherlog, a single workspace holds every language:

1. In **Settings → Languages**, pick the default language and turn on the others.
2. Choose what happens when a post isn't translated: show it in the default language, or hide it in that language.
3. Use **one snippet** everywhere. Delete the per-language account logic. The widget picks the language from `<html lang>` or the browser, and you can force it with `language: "es"`.

Each post has one translation per language, so "Dark mode" in English and "Modo oscuro" in Spanish are the same post. They share categories and publication date and have different URLs: `/acme/dark-mode-…` and `/acme/es/modo-oscuro-…`.

## 6. Bring over your old posts

There is no automatic Headway importer yet. It is on the roadmap. For now:

- **Copy recent posts by hand.** Create a post, paste the content (Headway's Markdown, including `![](url =300x200)` image sizing, works unchanged) and set the original date as the publication date before publishing.
- **Script it.** If you have an export or can scrape your old changelog, use the [REST API](api.md) to create posts with their original `publishedAt`. The API accepts dates in the past. Create drafts and publish them from the dashboard, or turn on *Integrations can publish* for the import.
- **Let an agent do it.** Connect Claude or another MCP client ([mcp.md](mcp.md)) and ask it to recreate posts from your old changelog page, as drafts for you to review.

Old Headway image URLs keep working only as long as Headway hosts them. Re-upload important images: `POST /api/v1/assets` with `{ "url": "…" }`, or the `upload_image` MCP tool.

## 7. Redirect your old changelog URL

If you had a custom domain on Headway (for example `changelog.example.com`), point it at Featherlog. One way is to make it your `PUBLIC_URL` (see [separate hosts](self-hosting.md#separate-hosts-for-public-pages-and-widget)). Another is to redirect it to `<PUBLIC_URL>/<slug>` at your DNS or CDN. Custom domains per workspace are coming later.
