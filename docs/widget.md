# Widget

The widget puts a badge in your product that shows how many updates the visitor hasn't seen. Clicking it opens a popup with your latest posts. It is a small loader script (`widget.js`). The posts render inside a sandboxed iframe served by Featherlog, so your page's CSS and the widget's CSS never interfere with each other.

The widget is **compatible with Headway snippets**. It reads `window.HW_config`, exposes `window.Headway` and uses the same `#HW_badge` element.

## Install

Copy the snippet from **Settings → Widget**:

```html
<!-- The badge will appear inside this element -->
<span class="featherlog-badge"></span>

<script>
  var HW_config = {
    selector: ".featherlog-badge",
    account: "YOUR_ACCOUNT_ID"
  };
</script>
<script async src="https://changelog.example.com/widget.js"></script>
```

- `account` is the workspace's public account id, shown in **Settings → Widget**. The REST API returns it as `publicId` from `GET /api/v1/workspace`.
- The script URL is `<WIDGET_URL>/widget.js`. `WIDGET_URL` defaults to `APP_URL`.
- `window.FL_config` works as an alias of `window.HW_config`.

**One snippet covers every language.** The widget uses the `lang` attribute of your `<html>` tag, then the browser language, and falls back to the workspace's default language. Set `language` to force one.

## Options

### Headway-compatible

| Option | Type | Description |
| --- | --- | --- |
| `account` | string | **Required.** Workspace account id. |
| `selector` | string | CSS selector of the element the badge is added to. Without it (or if nothing matches), no badge is shown. You can still open the popup with `trigger` or the JS API. |
| `enabled` | boolean | `false` stops auto-initialization when the script loads. Call `Featherlog.init()` yourself later. Default `true`. |
| `trigger` | string | CSS selector. Clicking any matching element toggles the popup, which is useful for a "What's new" menu item. |
| `position` | `{ x?: "left" \| "right", y?: "top" \| "bottom" }` | Forces the side the popup opens on. `x: "right"` extends to the right of the badge and `y: "bottom"` opens below it. By default it picks whichever side fits in the viewport (mirrored for RTL pages). |
| `translations` | object | Overrides texts: `title`, `readMore`, `footer`, and `labels` (category label overrides keyed by category name or slug, case-insensitive). |
| `embed` | boolean | Renders the list inline inside the `selector` element instead of a badge and popup. The iframe resizes to its content, and all posts are marked as seen when it loads. |
| `callbacks` | object | See [callbacks](#callbacks). |

### Featherlog extras

| Option | Type | Description |
| --- | --- | --- |
| `language` | string | Forces a language (`"es"`, `"pt-BR"` → `pt`). It must be enabled in the workspace, or the default language is used. |
| `widgetUrl` | string | Base URL of your Featherlog widget host. Normally it is detected from the script's `src`. Set it when you bundle or proxy `widget.js` yourself. |
| `token` | string | Reserved. It is passed to the iframe but has no effect yet. |

Example with everything:

```html
<script>
  var HW_config = {
    account: "YOUR_ACCOUNT_ID",
    selector: "#whats-new",
    trigger: ".open-changelog",
    language: "es",
    position: { x: "left", y: "bottom" },
    translations: {
      title: "Novedades",
      readMore: "Leer más",
      footer: "Ver todas las novedades",
      labels: { new: "Nuevo", fix: "Arreglo" }
    },
    callbacks: {
      onWidgetReady: function (widget) {
        console.log("unseen:", widget.getUnseenCount());
      },
      onShowWidget: function () {},
      onHideWidget: function () {},
      onShowDetails: function (changelog) {},
      onReadMore: function (changelog) {}
    }
  };
</script>
<script async src="https://changelog.example.com/widget.js"></script>
```

### Callbacks

| Callback | Called with | When |
| --- | --- | --- |
| `onWidgetReady(widget)` | the JS API object | Posts have loaded and the unseen count is known. |
| `onShowWidget()` | — | The popup opens. |
| `onHideWidget()` | — | The popup closes. |
| `onShowDetails(changelog)` | `{ position, id, title, category }` | A post is expanded in the popup. |
| `onReadMore(changelog)` | `{ position, id, title, category }` | The visitor follows a post's "Read more" link to the public page. |

`category` is the lowercased name of the post's first category, or `""`. `id` is the post's public id.

## JavaScript API

The loader exposes the same object as `window.Featherlog` and `window.Headway`:

| Method | Description |
| --- | --- |
| `init(config?)` | Initializes the widget. Any previous instance is destroyed first. Without arguments, it reads `HW_config`/`FL_config`. If the DOM is still loading, it waits for `DOMContentLoaded`. |
| `destroy()` | Removes the badge, popup, styles and event listeners. |
| `show()` | Opens the popup and marks every post as seen. |
| `hide()` | Closes the popup. |
| `toggle()` | Opens or closes the popup. |
| `getUnseenCount()` | Number of unseen posts. Returns `0` before the widget is ready. |
| `markAllSeen()` | Marks every loaded post as seen and clears the badge. |

```js
document.querySelector("#help-menu .whats-new").addEventListener("click", () => {
  window.Featherlog.toggle();
});
```

## Single-page apps (React, Vue…)

Load the script once, for example in `index.html`. Initialize the widget when the badge element is mounted and destroy it when it unmounts. The script loads `async`, so it may not be ready when your component mounts. This helper covers both cases:

```js
function initFeatherlog(config) {
  if (window.Featherlog) {
    window.Featherlog.init(config);
  } else {
    // widget.js hasn't loaded yet: it picks this up automatically when it does
    window.HW_config = config;
  }
}
```

React:

```jsx
useEffect(() => {
  initFeatherlog({ selector: ".featherlog-badge", account: "YOUR_ACCOUNT_ID" });
  return () => window.Featherlog?.destroy();
}, []);

return <span className="featherlog-badge" />;
```

Call `init()` again with a new `language` when the UI language changes. TypeScript declarations:

```ts
declare global {
  interface Window {
    Featherlog?: {
      init(config?: object): void;
      destroy(): void;
      show(): void;
      hide(): void;
      toggle(): void;
      getUnseenCount(): number;
      markAllSeen(): void;
    };
    HW_config?: object;
  }
}
```

## Styling the badge

The loader adds this markup inside your `selector` element:

```html
<span id="HW_badge_cont" class="HW_badge_cont fl-badge-cont">
  <span id="HW_badge" class="HW_badge fl-badge" role="button" tabindex="0">3</span>
</span>
```

The popup is `<div id="HW_frame_cont" role="dialog">`, appended to `<body>`.

| Selector | Meaning |
| --- | --- |
| `#HW_badge` | The counter bubble. Hidden unless it has `HW_visible`. |
| `#HW_badge.HW_visible` | There is something to show. |
| `#HW_badge.HW_softHidden` | Nothing new and *soft hide* is on: a small grey dot. |
| `#HW_badge.HW_animated` | The eye-catcher animation is running. |
| `#HW_badge.fl-eye-1`, `.fl-eye-2`, `.fl-eye-3` | Progressive eye-catcher intensity. |
| `#HW_frame_cont.HW_visible` | The popup is open. |
| `--fl-accent` | CSS variable on `#HW_badge_cont` with the widget's accent color. |

The default styles are injected in `<style id="HW_styles_cont">` with ID selectors. Override them with equal or higher specificity:

```css
#HW_badge_cont #HW_badge {
  background: #111;
  top: -6px;
  position: relative;
}
#HW_badge_cont #HW_badge.HW_softHidden {
  background: #d0d5dd;
}
```

The inside of the popup is styled by Featherlog and follows the widget's accent color and the visitor's light or dark preference. You can't restyle it from the host page.

## Dashboard settings

**Settings → Widget → Behavior** (also available through the API and MCP as widget settings):

| Setting | Values | Description |
| --- | --- | --- |
| Custom widget color | hex or off | Accent color for the badge and popup. When it is off, the workspace accent color is used. |
| Badge delay | 0–60 seconds (default 0) | Waits before showing the badge. |
| Posts shown | 1–20 (default 5) | How many recent posts the widget loads. Only these count toward the badge. |
| Badge count expires | never, or 1–365 days | Posts older than this don't count as new. |
| Soft hide (default on) | on / off | When nothing is new: **on** shows a small grey dot, so the visitor can still open the widget. **Off** hides the badge completely. |
| Eye-catcher | off / on (default) / progressive | `on`: the badge pulses while there are unseen posts. `progressive`: the animation gets stronger the longer updates stay unseen (from the 3rd and 6th page view). |
| Widget texts | per language | Overrides the built-in title, "Read more", footer link, back button, empty state and "New" label. |

The page also has a live preview of the real widget.

## Headless JSON endpoint

To build your own UI, fetch the same data the widget uses:

```
GET <WIDGET_URL>/api/widget/<account>?lang=es
```

```sh
curl https://changelog.example.com/api/widget/YOUR_ACCOUNT_ID?lang=en
```

```jsonc
{
  "locale": "en",
  "dir": "ltr",
  "settings": { "accentColor": "#3778FF", "badgeDelay": 0, "softHide": true,
                "eyecatcher": "on", "expireAfterDays": null, "whitelabel": false },
  "strings": { "title": "…", "readMore": "…", "footer": "…", "back": "…",
               "empty": "…", "poweredBy": "…", "newBadge": "…" },
  "workspace": { "name": "Acme", "url": "https://…/acme", "logoUrl": null },
  "categories": { "<id>": { "name": "New", "color": "#3778FF", "textColor": "#ffffff", "slug": "new" } },
  "items": [
    { "id": "<publicId>", "title": "…", "date": "2026-10-01T09:00:00.000Z",
      "excerpt": "…", "html": "<p>…</p>", "url": "https://…/acme/post-slug-<publicId>",
      "categoryIds": ["<id>"] }
  ]
}
```

- No authentication. CORS allows any origin.
- `lang` is optional. Without it, `Accept-Language` is used.
- Responses carry an `ETag`. Send `If-None-Match` to get `304 Not Modified`. Cache headers: `public, s-maxage=60, stale-while-revalidate=600`.
- `items` holds the latest *Posts shown* posts. `html` is sanitized.
- Unknown accounts return `404`.

## Privacy

- **No cookies.** The widget sets no cookies, on your domain or on Featherlog's.
- Seen and read state is kept in the visitor's `localStorage` on **your** site:
  - `featherlog:<account>:seen`: ids of posts already seen (the last 100)
  - `featherlog:<account>:read`: ids of posts opened
  - `featherlog:<account>:views`: page views with unseen posts (for the progressive eye-catcher)
- If `localStorage` isn't available, the widget still works, but every post counts as new.
- Featherlog doesn't track visitors. The iframe makes no network requests besides its own assets, and images and videos inside posts. Video embeds use privacy-friendly players (`youtube-nocookie.com`, Vimeo, Loom, Wistia) and are lazy-loaded.
- **Private mode** (Settings → Public page) keeps the public page out of reach unless the visitor arrives through a signed link from the widget, valid for about an hour, or is a workspace member. The widget itself, and `/api/widget/<account>`, still show your latest posts to anyone who loads them with your account id.

## Content Security Policy on your site

If your site sends a CSP, allow the widget host (your `WIDGET_URL`, for example `https://changelog.example.com`):

```
script-src  'self' https://changelog.example.com;
frame-src   https://changelog.example.com;
style-src   'self' 'unsafe-inline';
```

- `script-src`: loads `widget.js`. The inline `<script>var HW_config = …</script>` also needs a nonce or hash. Or move the config into your own bundled JavaScript and call `Featherlog.init({...})`.
- `frame-src` (or `child-src`): the popup iframe at `/_widget/<account>`.
- `style-src 'unsafe-inline'`: the loader injects a `<style>` element for the badge. If you can't allow inline styles, the badge appears unstyled. Copy the styles into your own stylesheet in that case.
- `connect-src` and `img-src` don't need changes. The loader makes no requests of its own, and post content loads inside the iframe.

The iframe has its own strict CSP (hash-based scripts, `connect-src 'none'`, `frame-src` limited to the supported video providers).
