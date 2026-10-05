import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { publicTokenCookie } from "@/lib/signed-links";

/*
 * Host-based routing for the three public faces of Featherlog:
 *   APP_URL     → panel, auth, API (and everything else when hosts are shared)
 *   PUBLIC_URL  → public changelog pages (/:slug/...), RSS, sitemaps
 *   WIDGET_URL  → widget loader + iframe + widget JSON
 * When all three share a host (local dev, simple deployments) everything is allowed.
 */

const APP_HOST = new URL(env.APP_URL).host.toLowerCase();
const PUBLIC_HOST = new URL(env.PUBLIC_URL).host.toLowerCase();
const WIDGET_HOST = new URL(env.WIDGET_URL).host.toLowerCase();

const WIDGET_PATH = /^\/(?:widget\.js$|widget\/|_widget\/|api\/widget\/|healthz$|uploads\/)/;
/** Paths that belong to the panel/app host only. */
const APP_PATH =
  /^\/(?:app|login|logout|signup|register|forgot-password|reset-password|verify|invite|consent|oauth|mcp|api|\.well-known)(?:\/|$)/;
/** First path segments that are never a workspace slug. */
const NON_PUBLIC_SEGMENT = new Set([
  "",
  "_next",
  "_widget",
  "widget",
  "widget.js",
  "api",
  "uploads",
  "healthz",
  "robots.txt",
  "favicon.ico",
]);

const notFound = () =>
  new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });

/**
 * Extension point for custom domains (`changelog.acme.com` → workspace `acme`).
 * The proxy must stay fast and DB-free: implement this with an in-memory map / edge config /
 * a signed header from the reverse proxy — not with a database query. Returns the workspace slug.
 */
export function resolveCustomDomain(_host: string): string | null {
  return null;
}

function requestHost(req: NextRequest) {
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return raw.split(",")[0]!.trim().toLowerCase();
}

function isPublicPagePath(pathname: string) {
  const first = pathname.split("/")[1] ?? "";
  return !NON_PUBLIC_SEGMENT.has(first) && !APP_PATH.test(pathname);
}

export function proxy(req: NextRequest) {
  const host = requestHost(req);
  const url = req.nextUrl;
  let pathname = url.pathname;
  let rewrite: URL | null = null;

  if (host && host !== APP_HOST) {
    if (host === WIDGET_HOST && host !== PUBLIC_HOST) {
      if (!WIDGET_PATH.test(pathname)) return notFound();
    } else if (host === PUBLIC_HOST) {
      if (pathname === "/" || APP_PATH.test(pathname)) {
        if (WIDGET_PATH.test(pathname) && host === WIDGET_HOST) {
          // Public and widget share a host: widget JSON lives under /api/widget.
        } else {
          return NextResponse.redirect(new URL(`${pathname}${url.search}`, env.APP_URL), 308);
        }
      }
    } else {
      const slug = resolveCustomDomain(host);
      if (slug) {
        if (APP_PATH.test(pathname)) return notFound();
        if (!pathname.startsWith("/_next/") && !WIDGET_PATH.test(pathname)) {
          pathname = `/${slug}${pathname === "/" ? "" : pathname}`;
          rewrite = new URL(`${pathname}${url.search}`, req.url);
        }
      }
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-fl-token");
  requestHeaders.set("x-fl-pathname", pathname);

  const publicPage = isPublicPagePath(pathname);
  const token = publicPage ? url.searchParams.get("t") : null;
  if (token) requestHeaders.set("x-fl-token", token.slice(0, 200));

  const init = { request: { headers: requestHeaders } };
  const res = rewrite ? NextResponse.rewrite(rewrite, init) : NextResponse.next(init);

  if (token) {
    // Private-mode link: remember the token for this changelog (verified by the page itself).
    const slug = pathname.split("/")[1]!;
    res.cookies.set(publicTokenCookie(slug), token.slice(0, 200), {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: `/${slug}`,
      maxAge: 3600,
    });
    res.headers.set("X-Robots-Tag", "noindex");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
