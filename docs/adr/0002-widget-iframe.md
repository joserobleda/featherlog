# ADR 0002: Widget renders inside an iframe, with a Headway-compatible loader

- **Status:** Accepted
- **Date:** 2026-10

## Context

The widget runs on other people's websites. Those pages have arbitrary CSS, strict or missing Content Security Policies, and frameworks that re-render the DOM. Post content is user-written HTML that is sanitized but still rich, with images, video embeds and code blocks. Many prospective users are migrating from Headway and have its snippet (`HW_config`, `window.Headway`, `#HW_badge`) embedded across their products.

The options were:

1. Render posts directly in the host DOM (optionally in a Shadow DOM) from a JSON API.
2. Render posts in an iframe served by Featherlog, with a small loader in the host page.

## Decision

- A tiny loader (`widget.js`) runs in the host page. It reads `HW_config`/`FL_config`, renders only the **badge** (`#HW_badge`, with the same class names as Headway) and a positioned container, and exposes the same API object as `window.Featherlog` and `window.Headway`.
- The **post list and details render inside an iframe** at `/_widget/<account>`. The server renders it with its data inlined (no extra fetch), protected by a strict hash-based CSP, and makes it cacheable at the edge for 60 seconds.
- The loader and the iframe talk over a small versioned `postMessage` protocol (`ready`, `init`, `setHeight`, `showDetails`, `readMore`, `markRead`, `hide`, `opened`, `closed`). Origin, source window and envelope are checked on both sides.
- Seen and read state lives in the **host origin's `localStorage`**, so the widget sets no cookies and works with third-party storage partitioning.
- A JSON endpoint (`/api/widget/<account>`) serves the same data for teams that want to build their own UI.

## Consequences

- Host CSS can't break the widget, and widget CSS can't leak into the host. Post HTML never touches the host DOM, which limits the impact of any sanitizer bug to the widget origin.
- Host sites only need to allow the widget origin in `script-src` and `frame-src`, plus inline styles for the badge.
- Headway users switch by changing the script URL and account id. Their callbacks, API calls and badge CSS keep working.
- The iframe costs one extra document load when the page loads. It is small and cached, and its data is inlined.
- The popup's inside can't be restyled by the host. Theming goes through settings (accent color, texts) rather than CSS.
- Two bundles (loader and frame app) have to stay compatible across versions. Cache-busting uses content hashes, and the protocol is versioned.
