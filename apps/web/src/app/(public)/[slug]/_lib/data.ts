import "server-only";
import {
  findWorkspaceBySlug,
  getMembershipRole,
  listCategories,
  type Workspace,
} from "@featherlog/core";
import { postTranslations } from "@featherlog/db";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicTokenCookie, verifyPublicToken } from "@/lib/signed-links";

/** Workspace by slug (old slugs resolve with `redirectedFrom`), deduped per request. */
export const loadWorkspace = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return null;
  return findWorkspaceBySlug(db, slug);
});

export const loadCategories = cache((workspaceId: string) => listCategories(db, workspaceId));

/** Slug of each translation of a post, keyed by locale. */
export const loadPostSlugs = cache(async (postId: string) => {
  const rows = await db
    .select({ locale: postTranslations.locale, slug: postTranslations.slug })
    .from(postTranslations)
    .where(eq(postTranslations.postId, postId));
  return Object.fromEntries(rows.map((r) => [r.locale, r.slug])) as Record<string, string>;
});

/** Enabled locales with the default one first. */
export function orderedLocales(ws: Workspace) {
  return [ws.defaultLocale, ...ws.locales.filter((l) => l !== ws.defaultLocale)];
}

export function isAltLocale(ws: Workspace, code: string | undefined): code is string {
  return !!code && code !== ws.defaultLocale && ws.locales.includes(code);
}

/** Locale of the current public request, derived from the pathname the proxy forwards. */
export async function requestLocale(ws: Workspace | null) {
  if (!ws) return "en";
  const pathname = (await headers()).get("x-fl-pathname") ?? "";
  const second = pathname.split("/")[2];
  return isAltLocale(ws, second) ? second : ws.defaultLocale;
}

/** Workspace of the current request (from the pathname header) — used by not-found UI. */
export async function requestWorkspace() {
  const pathname = (await headers()).get("x-fl-pathname") ?? "";
  const slug = pathname.split("/")[1];
  if (!slug) return null;
  return (await loadWorkspace(decodeURIComponent(slug)))?.workspace ?? null;
}

export type Access = {
  ok: boolean;
  /** Token to keep on internal links (only when it came from the query string). */
  token: string | null;
};

/**
 * Private-mode gate: a valid signed token (`?t=` or the cookie set by the proxy),
 * or a signed-in member of the workspace.
 */
export const checkAccess = cache(
  async (ws: Workspace, queryToken: string | null): Promise<Access> => {
    if (!ws.privateMode) return { ok: true, token: null };
    const headerToken = (await headers()).get("x-fl-token");
    for (const t of [queryToken, headerToken]) {
      if (t && verifyPublicToken(ws.id, t)) return { ok: true, token: t };
    }
    const jar = await cookies();
    const fromCookie = jar.get(publicTokenCookie(ws.slug))?.value;
    if (fromCookie && verifyPublicToken(ws.id, fromCookie)) return { ok: true, token: null };
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      if (session && (await getMembershipRole(db, ws.id, session.user.id))) {
        return { ok: true, token: null };
      }
    } catch {
      // No session / auth unavailable on this host.
    }
    return { ok: false, token: null };
  },
);

export function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

export type ParsedPath =
  | { kind: "list"; locale: string }
  | { kind: "post"; locale: string; slug: string; publicId: string }
  | { kind: "redirect"; to: string }
  | { kind: "notFound" };

const POST_REF = /^(.*)-([a-z0-9]{8})$/;

function parseRef(ref: string) {
  const m = POST_REF.exec(ref);
  return m ? { slug: m[1] ?? "", publicId: m[2]! } : null;
}

/** Parses `[[...path]]` below `/:slug`. */
export function parsePublicPath(ws: Workspace, path: string[]): ParsedPath {
  const segs = path.map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  if (segs.length === 0) return { kind: "list", locale: ws.defaultLocale };
  const [a, b] = segs;
  if (segs.length === 1) {
    if (isAltLocale(ws, a)) return { kind: "list", locale: a };
    if (a === ws.defaultLocale) return { kind: "redirect", to: "" };
    const ref = parseRef(a!);
    return ref ? { kind: "post", locale: ws.defaultLocale, ...ref } : { kind: "notFound" };
  }
  if (segs.length === 2) {
    if (a === ws.defaultLocale) return { kind: "redirect", to: `/${b}` };
    if (!isAltLocale(ws, a)) return { kind: "notFound" };
    const ref = parseRef(b!);
    return ref ? { kind: "post", locale: a, ...ref } : { kind: "notFound" };
  }
  return { kind: "notFound" };
}

/** Builds a query string (with leading `?`) from the defined entries. */
export function qs(params: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Path of a workspace page relative to the host (`/acme`, `/acme/es/post-ab12cd34`). */
export function wsPath(ws: Pick<Workspace, "slug">, rest = "") {
  return `/${ws.slug}${rest}`;
}
