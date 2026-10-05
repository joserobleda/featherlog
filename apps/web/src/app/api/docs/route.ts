import { env } from "@/lib/env";

/** Interactive API reference (Scalar), reading the generated OpenAPI document. */
export function GET() {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Featherlog API reference</title></head>
<body>
<script id="api-reference" data-url="${env.APP_URL}/api/v1/openapi.json"></script>
<script>document.getElementById('api-reference').dataset.configuration = JSON.stringify({ theme: 'default', hideClientButton: false, metaData: { title: 'Featherlog API' } });</script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
