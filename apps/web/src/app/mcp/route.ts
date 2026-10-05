import { requireMcpAuth } from "@better-auth/mcp";
import { SCOPES, type Scope, verifyApiKey } from "@featherlog/core";
import { schema } from "@featherlog/db";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { auth, MCP_RESOURCE } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { buildMcpServer, type McpPrincipal } from "@/server/mcp/server";

export const dynamic = "force-dynamic";

/**
 * MCP endpoint (Streamable HTTP; 2026-07-28 with stateless fallback for 2025-era clients).
 * Auth: OAuth 2.1 access token issued by our authorization server, or a workspace API key.
 */
const mcp = createMcpHandler(
  (ctx) => {
    const principal = ctx.authInfo?.extra?.principal as McpPrincipal | undefined;
    if (!principal) throw new Error("Unauthenticated MCP request");
    return buildMcpServer(principal);
  },
  { legacy: "stateless", onerror: (err) => logger.warn({ err }, "mcp error") },
);

const clientNames = new Map<string, string>();
/** Human-readable OAuth client name (shown as the author of posts it creates). */
async function clientName(clientId: string) {
  const cached = clientNames.get(clientId);
  if (cached) return cached;
  const [row] = await db
    .select({ name: schema.oauthClient.name })
    .from(schema.oauthClient)
    .where(eq(schema.oauthClient.clientId, clientId));
  const name = row?.name ? `${row.name} (MCP)` : "MCP client";
  clientNames.set(clientId, name);
  return name;
}

const withOAuth = requireMcpAuth(
  auth,
  async (request, claims) => {
    const scopes = String(claims.scope ?? "")
      .split(" ")
      .filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));
    const clientId = String(claims.azp ?? claims.client_id ?? "mcp-client");
    const principal: McpPrincipal = {
      kind: "user",
      userId: String(claims.sub),
      scopes,
      clientName: await clientName(clientId),
    };
    return mcp.fetch(request, {
      authInfo: { token: "oauth", clientId, scopes, extra: { principal } },
    });
  },
  { resource: MCP_RESOURCE },
);

async function handle(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token.startsWith("fl_live_")) {
    const verified = await verifyApiKey(db, token);
    if (!verified) {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Invalid, expired or revoked API key" },
          id: null,
        },
        { status: 401 },
      );
    }
    const principal: McpPrincipal = {
      kind: "api_key",
      workspaceId: verified.workspaceId,
      actor: verified.actor,
    };
    return mcp.fetch(request, {
      authInfo: { token: "api_key", clientId: verified.apiKeyId, scopes: [], extra: { principal } },
    });
  }
  return withOAuth(request);
}

export { handle as DELETE, handle as GET, handle as POST };
