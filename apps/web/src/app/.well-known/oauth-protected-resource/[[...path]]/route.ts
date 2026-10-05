import { auth } from "@/lib/auth";

// RFC 9728 protected resource metadata for the MCP endpoint (served by the Better Auth MCP plugin).
export const GET = (req: Request) => auth.handler(req);
export const HEAD = GET;
