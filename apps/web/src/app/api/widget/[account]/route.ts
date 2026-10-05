import { createHash } from "node:crypto";
import { buildFrameData, WIDGET_CACHE_CONTROL } from "@/lib/widget-data";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "If-None-Match, Accept-Language",
  "Access-Control-Expose-Headers": "ETag",
};

/** GET /api/widget/:account?lang= — widget data as JSON, for headless integrations. */
export async function GET(req: Request, { params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  const url = new URL(req.url);
  const data = await buildFrameData(account, {
    lang: url.searchParams.get("lang"),
    acceptLanguage: req.headers.get("accept-language"),
  });
  if (!data) {
    return Response.json(
      { error: { code: "not_found", message: "Unknown widget account" } },
      { status: 404, headers: { ...CORS, "Cache-Control": "public, s-maxage=60" } },
    );
  }
  const { settings, strings, workspace, categories, items, locale, dir } = data;
  const body = JSON.stringify({ locale, dir, settings, strings, workspace, categories, items });
  const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
  const headers = {
    ...CORS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": WIDGET_CACHE_CONTROL,
    Vary: "Accept-Language",
    ETag: etag,
  };
  const inm = req.headers.get("if-none-match");
  if (inm?.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Max-Age": "86400" },
  });
}
